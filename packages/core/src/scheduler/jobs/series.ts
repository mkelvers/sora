import { attempt } from "@sora/shared";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { anilist } from "../../anilist/client";
import { NewEntriesDocument } from "../../anilist/graphql.generated";
import { fuzzyDate } from "../../catalog/models/text";
import { db } from "../../database/client";
import {
	animeSearch,
	providerEpisodes,
	series,
	seriesEpisode,
	tmdbMapping,
	tmdbResponse,
} from "../../database/schema";
import { AnimeNotFoundError, UpstreamUnavailableError } from "../../errors";
import { aniKoto } from "../../playback/providers/registry";
import { franchiseRelations, idsRelatedBy } from "../../series/entries";
import { episodeReleasedAt } from "../../series/episodes";
import { expireMapping, mappedEpisodes } from "../../series/mapping";
import { continuesPastLinks } from "../../series/matching";
import { storedSeriesIds, storeSeries } from "../../series/store";
import { day, hour, minute } from "../../time";
import {
	editsWindowMs,
	getShow,
	tmdbImageUrl,
	withEdits,
	type TmdbEpisode,
	type TmdbShow,
} from "../../tmdb/resources";
import { scheduleSeriesStore, scheduleStoredSeriesRefresh } from "../queue";

const StoreSeriesPayloadSchema = z.object({
	anilistId: z.number().int().positive(),
});

/**
 * Lays out and stores one AniList entry as a series.
 *
 * Queued for a new entry, for the entries related to a stored series, and
 * while a stored entry airs. Throwing lets graphile-worker retry with
 * backoff, which is how an AniList or TMDB outage is handled.
 *
 * Nothing is done when the series was laid out after the job was last
 * queued: that layout already has what the job was queued for.
 */
export const storeSeriesJob: Task = async (rawPayload, helpers) => {
	const { anilistId } = StoreSeriesPayloadSchema.parse(rawPayload);
	const [laidOut] = await db
		.select({
			seriesId: series.id,
		})
		.from(series)
		.where(and(eq(series.anilistId, anilistId), gte(series.laidOutAt, helpers.job.updated_at)))
		.limit(1);
	if (laidOut) {
		helpers.logger.info(`Series ${laidOut.seriesId} of anime ${anilistId} is already laid out`);
		return;
	}

	const { data, error } = await attempt(storeSeries(anilistId), AnimeNotFoundError);
	if (error) {
		// Searches queue every entry they find that is not stored, so an entry
		// left in the index would be queued again by each one. A sync puts it
		// back should AniList serve it again.
		await db.delete(animeSearch).where(eq(animeSearch.anilistId, anilistId));
		helpers.logger.warn(`Anime ${anilistId} is gone from AniList; not storing its series`);
		return;
	}
	helpers.logger.info(`Stored series ${data} for anime ${anilistId}`);
};

/** AniList pages are capped at 50 entries. */
const entriesPerPage = 50;

/**
 * Pages of upcoming and airing entries read per run, newest first. AniList
 * lists well under 1,000 of them at a time.
 */
const discoveryPageLimit = 20;

/** Upcoming entries premiering within this window are stored ahead of time. */
const premiereWindowMs = 14 * day;

/** The graphile-worker task that finds new entries to store. */
export const discoverSeriesEntriesTask = "discover-series-entries";

/**
 * Finds AniList entries whose series should be stored and queues storing
 * them. Reads every upcoming and airing entry and picks those not stored yet
 * that:
 *
 * - are airing, so the release schedule can show them;
 * - premiere within {@link premiereWindowMs}, for the same reason;
 * - or are related to a stored entry, such as a newly announced season, so
 *   its franchise lists it.
 *
 * An entry that qualifies for none of these yet is simply looked at again
 * on the next run.
 */
export const discoverSeriesEntries: Task = async (_payload, helpers) => {
	const premiereCutoff = new Date(Date.now() + premiereWindowMs).toISOString().slice(0, 10);
	let queued = 0;
	for (let page = 1; page <= discoveryPageLimit; page += 1) {
		const { Page } = await anilist(
			NewEntriesDocument,
			{
				page,
				perPage: entriesPerPage,
			},
			{
				maxAgeMs: hour,
			},
		);

		const entries = (Page?.media ?? []).flatMap((media) =>
			media && media.format !== "MUSIC" ? [media] : [],
		);
		const stored = await storedSeriesIds([
			...entries.map((entry) => entry.id),
			...entries.flatMap((entry) => idsRelatedBy(entry, franchiseRelations)),
		]);

		for (const entry of entries) {
			const startDate = entry.startDate ? fuzzyDate(entry.startDate) : null;
			const premieresSoon =
				startDate !== null && startDate.length === 10 && startDate <= premiereCutoff;
			const isWanted =
				entry.status === "RELEASING" ||
				premieresSoon ||
				idsRelatedBy(entry, franchiseRelations).some((id) => stored.has(id));
			if (!stored.has(entry.id) && isWanted) {
				await scheduleSeriesStore(entry.id, "backfill");
				queued += 1;
			}
		}

		if (Page?.pageInfo?.hasNextPage !== true) {
			break;
		}
	}

	if (queued > 0) {
		helpers.logger.info(`Queued ${queued} entries to store their series`);
	}
};

/**
 * How long to wait before asking TMDB again about something that has been
 * missing for `missingForMs`: a tenth of that, within `bounds`. What is
 * written soon after an episode airs is asked about often, and what has been
 * missing for days or years, and so is unlikely to come today, rarely.
 */
function recheckAfterMs(
	missingForMs: number | null,
	bounds: {
		min: number;
		max: number;
	},
) {
	return Math.min(bounds.max, Math.max(bounds.min, (missingForMs ?? Infinity) / 10));
}

/** Any stored copy of a show: what the last reader of it fetched. */
const storedShowAgeMs = 365 * day;

/** Whether AniKoto carries a stored episode, which a series lists it for (see `isEpisodeShown`). */
const onAniKoto = sql`exists (
    select 1
    from ${providerEpisodes}, jsonb_array_elements(${providerEpisodes.units}) as unit
    where ${providerEpisodes.anilistId} = ${series.anilistId}
      and ${providerEpisodes.provider} = ${aniKoto.id}
      and (unit ->> 'number')::numeric = ${seriesEpisode.number}
  )`;

/** Whether a stored episode aired within the time TMDB's change log of it is read for. */
const airedLately = sql`${episodeReleasedAt} between now() - make_interval(secs => ${editsWindowMs / 1_000}) and now()`;

/** Whether a stored episode has no title, or only TMDB's "Episode N". */
const isUnnamed = sql`(${seriesEpisode.title} is null or ${seriesEpisode.title} ~* '^episode [0-9]+$')`;

/** The graphile-worker task that fills in details TMDB added after an episode aired. */
export const refreshEpisodeDetailsTask = "refresh-episode-details";

/**
 * How far apart the runs of {@link refreshEpisodeDetails} are, as the
 * scheduler's crontab has it. TMDB's CDN answers a change log's request with
 * the same copy for ten minutes, so runs any closer would be answered with
 * what the run before got.
 */
const detailsRunEveryMs = 12 * minute;

/**
 * Fills in the title, overview, runtime, and still TMDB got for an episode
 * after it aired, from the episode's change log (see `withEdits`). TMDB has
 * them an hour or two after the broadcast for most episodes, and serves the
 * show without them for hours more.
 *
 * Only the episodes worth asking about are, each with a request of its own:
 *
 * - one a series lists, so TMDB lists it and AniKoto carries it;
 * - that aired within the time its change log is read for;
 * - and lacks a title other than TMDB's "Episode N", an overview, or a
 *   still that the episode before it has. What TMDB never wrote for the
 *   last episode, as for most donghua, it is not asked about for this one;
 *   a first episode is asked about in full.
 *
 * How often is up to {@link recheckAfterMs}: every run for the first two
 * hours after it aired, then less and less often. Measured over the 197
 * episodes of thirteen days, that is about 115 requests a day, and details
 * are stored a median of eight minutes after TMDB gets them.
 *
 * The details are written straight into the stored episodes: a layout needs
 * AniList, whose requests go to more urgent jobs first, so a queued one can
 * wait for hours. A layout reads the same change logs as they are stored,
 * so it writes the same details.
 */
export const refreshEpisodeDetails: Task = async (_payload, helpers) => {
	const awaited = await db.execute<{
		series_id: string;
		show_id: number;
		season_number: number;
		episode_number: number;
		missing_for_ms: number;
	}>(sql`
    select
      ${series.id} as series_id,
      substring(${series.key} from '[0-9]+$')::int as show_id,
      ${seriesEpisode.tmdbSeasonNumber} as season_number,
      ${seriesEpisode.tmdbEpisodeNumber} as episode_number,
      (extract(epoch from now() - ${episodeReleasedAt}) * 1000)::float8 as missing_for_ms
    from ${seriesEpisode}
    inner join ${series} on ${series.id} = ${seriesEpisode.seriesId}
    left join lateral (
      select
        earlier.number,
        earlier.title is not null and earlier.title !~* '^episode [0-9]+$' as is_named,
        earlier.overview,
        earlier.still_url
      from series_episode as earlier
      where earlier.series_id = ${series.id}
        and earlier.tmdb_episode_number is not null
        and earlier.number < ${seriesEpisode.number}
      order by earlier.number desc
      limit 1
    ) as previous on true
    where ${series.key} ~ '^(tv|shorts):[0-9]+$'
      and ${seriesEpisode.tmdbEpisodeNumber} is not null
      and ${airedLately}
      and (
        (${isUnnamed} and coalesce(previous.is_named, true))
        or (${seriesEpisode.overview} is null and (previous.number is null or previous.overview is not null))
        or (${seriesEpisode.stillUrl} is null and (previous.number is null or previous.still_url is not null))
      )
      and ${onAniKoto}
  `);

	let updated = 0;
	for (const [seriesId, episodes] of Map.groupBy(awaited, (episode) => episode.series_id)) {
		const showId = episodes[0]?.show_id;
		if (showId === undefined) {
			continue;
		}

		const show = await attempt(
			getShow(showId, {
				maxAgeMs: storedShowAgeMs,
			}),
			UpstreamUnavailableError,
		);
		if (show.error) {
			helpers.logger.warn(`TMDB failed for show ${showId}: ${show.error.message}`);
			continue;
		}

		const edited = await attempt(
			Promise.all(
				episodes.flatMap((episode) => {
					const listed = show.data?.episodes.find(
						(candidate) =>
							candidate.season_number === episode.season_number &&
							candidate.episode_number === episode.episode_number,
					);
					return listed
						? [
								withEdits(listed, {
									// A minute short, so a run is never a moment too early for it.
									maxAgeMs:
										recheckAfterMs(episode.missing_for_ms, {
											min: detailsRunEveryMs,
											max: editsWindowMs,
										}) - minute,
								}),
							]
						: [];
				}),
			),
			UpstreamUnavailableError,
		);
		if (edited.error) {
			helpers.logger.warn(`TMDB failed for show ${showId}: ${edited.error.message}`);
			continue;
		}

		updated += await copyEpisodeDetails(seriesId, edited.data);
	}

	if (updated > 0) {
		helpers.logger.info(
			`Filled in ${updated} of ${awaited.length} episodes awaiting details from TMDB`,
		);
	}
};

/** The graphile-worker task that picks up episodes TMDB starts to list. */
export const refreshEpisodeListingsTask = "refresh-episode-listings";

/** How long a show whose episode TMDB has not listed for years goes unasked. */
const longestListingWaitMs = 30 * day;

/**
 * Asks TMDB again for the shows of stored series with an episode that a
 * series lists, or would, and that TMDB is behind on:
 *
 * - one AniKoto carries that TMDB does not list, which a series does not
 *   list until TMDB does (see `isEpisodeShown`), however long that takes.
 *   The show is asked for as often as {@link recheckAfterMs} says: hourly
 *   for an episode that just aired, and monthly for the many specials and
 *   recaps TMDB has not listed in years and mostly never will. Listing it
 *   changes the layout, so the series is queued to be laid out again once
 *   TMDB lists episodes it did not list before, or lists episodes past
 *   those its stored match links (see `continuesPastLinks`), which expires
 *   the match; some never line up with
 *   TMDB's numbering, and laying them out again changed nothing.
 * - one that aired lately and still has no title other than TMDB's
 *   "Episode N", no overview, or no still. {@link refreshEpisodeDetails}
 *   fills in the ones TMDB is likely to write within minutes; this asks for
 *   the whole show daily, for the rest and for what else TMDB changed of
 *   it. Tracking an anime stops once its last episode airs, so without
 *   either a finale keeps its bare title.
 *
 * TMDB's details are copied straight into the stored episodes of each show
 * fetched. A film's details only come with a layout, which is queued daily
 * while one is missing. So do those of an entry TMDB was not matched to,
 * often a new season TMDB lists hours after it premieres: it is matched
 * again as often as {@link recheckAfterMs} says, from hourly while the
 * episode is new to daily.
 *
 * Measured on 198 series with an unlisted episode and 17 with one lacking
 * details, that is about 25 requests a day. An unmatched entry costs at most
 * about 45 layouts over the twelve days after an episode, ten of them in the
 * first ten hours, and none once it is matched; two had a new episode.
 */
export const refreshEpisodeListings: Task = async (_payload, helpers) => {
	const unlisted = sql`(
    ${series.kind} = 'tv'
    and ${seriesEpisode.tmdbEpisodeNumber} is null
  )`;
	const lacksDetails = sql`(
    ${airedLately}
    and (${isUnnamed} or ${seriesEpisode.overview} is null or ${seriesEpisode.stillUrl} is null)
  )`;
	const behind = await db.execute<{
		series_id: string;
		key: string;
		anilist_id: number;
		is_unlisted: boolean;
		unlisted_for_ms: number | null;
		lacks_details: boolean;
		lacking_for_ms: number | null;
		laid_out_for_ms: number;
	}>(sql`
    select
      ${series.id} as series_id,
      ${series.key} as key,
      ${series.anilistId} as anilist_id,
      bool_or(${unlisted}) as is_unlisted,
      (extract(epoch from now() - max(${episodeReleasedAt}) filter (where ${unlisted})) * 1000)::float8 as unlisted_for_ms,
      bool_or(${lacksDetails}) as lacks_details,
      (extract(epoch from now() - max(${episodeReleasedAt}) filter (where ${lacksDetails})) * 1000)::float8 as lacking_for_ms,
      (extract(epoch from now() - ${series.laidOutAt}) * 1000)::float8 as laid_out_for_ms
    from ${seriesEpisode}
    inner join ${series} on ${series.id} = ${seriesEpisode.seriesId}
    where (${unlisted} or ${lacksDetails})
      and ${onAniKoto}
    group by ${series.id}
  `);

	const showIds = new Map(
		behind.flatMap(({ series_id, key }) => {
			const showId = /^(?:tv|shorts):(\d+)$/.exec(key)?.[1];
			return showId ? [[series_id, Number(showId)] as const] : [];
		}),
	);
	// When each show was last fetched, so one fetched lately is not even read.
	const paths = [...new Set(showIds.values())].map((showId) => `/tv/${showId}`);
	const fetchedAt = new Map(
		paths.length > 0
			? (
					await db
						.select({
							path: tmdbResponse.path,
							at: sql<Date>`max(${tmdbResponse.fetchedAt})`.mapWith(tmdbResponse.fetchedAt),
						})
						.from(tmdbResponse)
						.where(inArray(tmdbResponse.path, paths))
						.groupBy(tmdbResponse.path)
				).map(({ path, at }) => [path, at.getTime()] as const)
			: [],
	);

	let fetched = 0;
	let updated = 0;
	let queued = 0;
	for (const row of behind) {
		const showId = showIds.get(row.series_id);
		if (showId === undefined) {
			const isUnmatched = row.key.startsWith("anilist:");
			const relayoutAfterMs =
				isUnmatched && row.lacks_details
					? recheckAfterMs(row.lacking_for_ms, {
							min: hour,
							max: day,
						})
					: day;
			if (row.laid_out_for_ms > relayoutAfterMs) {
				if (isUnmatched) {
					await expireMapping(row.anilist_id);
				}
				await scheduleStoredSeriesRefresh(row.anilist_id);
				queued += 1;
			}
			continue;
		}

		const maxAgeMs = Math.min(
			row.is_unlisted
				? recheckAfterMs(row.unlisted_for_ms, {
						min: hour,
						max: longestListingWaitMs,
					})
				: Infinity,
			row.lacks_details ? day : Infinity,
		);
		if (Date.now() - (fetchedAt.get(`/tv/${showId}`) ?? 0) < maxAgeMs) {
			continue;
		}

		// The stored copy is read before the fresh one replaces it.
		const stored = await attempt(
			getShow(showId, {
				maxAgeMs: storedShowAgeMs,
			}),
			UpstreamUnavailableError,
		);
		if (stored.error) {
			helpers.logger.warn(`TMDB failed for show ${showId}: ${stored.error.message}`);
			continue;
		}

		const fresh = await attempt(
			getShow(showId, {
				maxAgeMs,
			}),
			UpstreamUnavailableError,
		);
		if (fresh.error) {
			helpers.logger.warn(`TMDB failed for show ${showId}: ${fresh.error.message}`);
			continue;
		}

		const before = stored.data;
		const show = fresh.data;

		fetched += 1;
		if (show) {
			updated += await copyEpisodeDetails(row.series_id, show.episodes);
		}

		// A series is matched to TMDB's episodes once a day at most, so one
		// matched before TMDB listed its latest episodes keeps linking only
		// the earlier ones until it is matched anew.
		const [mapping] = show
			? await db
					.select()
					.from(tmdbMapping)
					.where(eq(tmdbMapping.anilistId, row.anilist_id))
					.limit(1)
			: [];
		const isMatchStale =
			row.is_unlisted && show && mapping && continuesPastLinks(show, mappedEpisodes(mapping));

		// A show TMDB no longer has needs its series matched anew.
		if (
			!show ||
			isMatchStale ||
			(row.is_unlisted && (!before || episodeKeys(before) !== episodeKeys(show)))
		) {
			if (isMatchStale) {
				await expireMapping(row.anilist_id);
			}
			await scheduleStoredSeriesRefresh(row.anilist_id);
			queued += 1;
		}
	}

	helpers.logger.info(
		`Asked TMDB for ${fetched} of ${showIds.size} shows it is behind on, filled in ${updated} episodes, and queued ${queued} of ${behind.length} series to be laid out again`,
	);
};

/** Which episodes TMDB lists for a show, by season and number. */
function episodeKeys(show: TmdbShow) {
	return show.episodes
		.map((episode) => `${episode.season_number}:${episode.episode_number}`)
		.sort()
		.join(",");
}

/**
 * Copies TMDB's details of `episodes` onto a stored series' episodes, as a
 * layout would derive them (see `layoutEpisodes`). Returns how many
 * episodes changed.
 */
async function copyEpisodeDetails(seriesId: string, episodes: readonly TmdbEpisode[]) {
	const tmdbEpisodes = new Map(
		episodes.map((episode) => [`${episode.season_number}:${episode.episode_number}`, episode]),
	);
	const stored = await db
		.select({
			number: seriesEpisode.number,
			title: seriesEpisode.title,
			overview: seriesEpisode.overview,
			airDate: seriesEpisode.airDate,
			runtimeMinutes: seriesEpisode.runtimeMinutes,
			stillUrl: seriesEpisode.stillUrl,
			tmdbSeasonNumber: seriesEpisode.tmdbSeasonNumber,
			tmdbEpisodeNumber: seriesEpisode.tmdbEpisodeNumber,
		})
		.from(seriesEpisode)
		.where(and(eq(seriesEpisode.seriesId, seriesId), isNotNull(seriesEpisode.tmdbEpisodeNumber)));

	let changed = 0;
	for (const episode of stored) {
		const tmdbEpisode = tmdbEpisodes.get(
			`${episode.tmdbSeasonNumber}:${episode.tmdbEpisodeNumber}`,
		);
		if (!tmdbEpisode) {
			continue;
		}

		const details = {
			title: tmdbEpisode.name,
			overview: tmdbEpisode.overview,
			airDate: tmdbEpisode.air_date,
			// Without TMDB's runtime a layout falls back to AniList's, which is not at hand here.
			runtimeMinutes: tmdbEpisode.runtime ?? episode.runtimeMinutes,
			stillUrl: tmdbImageUrl(tmdbEpisode.still_path, "original"),
		};
		if (
			Object.entries(details).every(
				([name, value]) => episode[name as keyof typeof details] === value,
			)
		) {
			continue;
		}

		await db
			.update(seriesEpisode)
			.set(details)
			.where(and(eq(seriesEpisode.seriesId, seriesId), eq(seriesEpisode.number, episode.number)));
		changed += 1;
	}

	return changed;
}
