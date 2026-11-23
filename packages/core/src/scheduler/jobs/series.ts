import { attempt, day, hour, minute, sequence } from "@sora/shared";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { anilist } from "../../anilist/client";
import { NewEntriesDocument } from "../../anilist/graphql.generated";
import { zNewEntriesQuery } from "../../anilist/validation.generated";
import { fuzzyDate } from "../../catalog/models/text";
import { config } from "../../config";
import { db } from "../../database/client";
import { animeSearch, tmdbResponse } from "../../database/schema/catalog";
import { providerEpisodes } from "../../database/schema/playback";
import { series, titleEpisode, tmdbMapping } from "../../database/schema/series";
import { UnknownAnimeError, UpstreamUnavailableError } from "../../errors";
import { aniKoto } from "../../playback/providers/registry";
import { franchiseRelations, idsRelatedBy } from "../../series/entries";
import { releaseTime } from "../../series/episodes";
import { mappings } from "../../series/mapping";
import { store } from "../../series/store";
import { editsWindowMs, getShow, withEdits } from "../../tmdb/resources";
import { withChoices } from "../../tmdb/stills";
import { parseInput } from "../payload";
import { scheduleSeriesStore, scheduleRefresh } from "../queue";
import { Absence } from "./absence";
import { Behind, storedShowMs } from "./behind";
import { StoredEpisodes } from "./stored-episodes";

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
export const storeEntry: Task = async (rawPayload, helpers) => {
	const { anilistId } = parseInput(
		z.object({
			anilistId: z.number().int().positive(),
		}),
		rawPayload,
	);

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

	const { data, error } = await attempt(store.save(anilistId), UnknownAnimeError);

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

/** The graphile-worker task that finds new entries to store. */
export const discoverEntriesTask = "discover-series-entries";

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
 * With `PRELOAD_TITLES` off, only the last: the release timetable stores
 * what airs this week, and other titles are stored when someone opens them.
 *
 * An entry that qualifies for none of these yet is simply looked at again
 * on the next run.
 */
export const discoverEntries: Task = async (_payload, helpers) => {
	/** Upcoming entries premiering within this window are stored ahead of time. */
	const premiereWindowMs = 14 * day;

	/**
	 * Pages of upcoming and airing entries read per run, newest first. AniList
	 * lists well under 1,000 of them at a time.
	 */
	const discoveryPageLimit = 20;

	/** AniList pages are capped at 50 entries. */
	const entriesPerPage = 50;

	const premiereCutoff = new Date(Date.now() + premiereWindowMs).toISOString().slice(0, 10);

	const discoverPage = async (page: number, queuedSoFar: number): Promise<number> => {
		const { Page } = await anilist(
			NewEntriesDocument,
			{
				page,
				perPage: entriesPerPage,
			},
			zNewEntriesQuery,
			{
				maxAgeMs: hour,
			},
		);

		const entries = (Page?.media ?? []).flatMap((media) => {
			if (media && media.format !== "MUSIC") {
				return [media];
			}

			return [];
		});

		const stored = await store.ids([
			...entries.map((entry) => entry.id),
			...entries.flatMap((entry) => idsRelatedBy(entry, franchiseRelations)),
		]);

		const wanted = entries.filter((entry) => {
			let startDate: string | null = null;

			if (entry.startDate) {
				startDate = fuzzyDate(entry.startDate);
			}

			const premieresSoon =
				startDate !== null && startDate.length === 10 && startDate <= premiereCutoff;

			const isWanted =
				(config.preloadTitles && (entry.status === "RELEASING" || premieresSoon)) ||
				idsRelatedBy(entry, franchiseRelations).some((id) => stored.has(id));

			return !stored.has(entry.id) && isWanted;
		});

		await sequence.all(wanted, (entry) => scheduleSeriesStore(entry.id, "backfill"));

		const queuedNow = queuedSoFar + wanted.length;

		if (Page?.pageInfo?.hasNextPage !== true || page >= discoveryPageLimit) {
			return queuedNow;
		}

		return await discoverPage(page + 1, queuedNow);
	};

	const queued = await discoverPage(1, 0);

	if (queued > 0) {
		helpers.logger.info(`Queued ${queued} entries to store their series`);
	}
};

/** Whether AniKoto carries a stored episode, which a series lists it for (see `isAvailable`). */
const onAniKoto = sql`exists (
    select 1
    from ${providerEpisodes}, jsonb_array_elements(${providerEpisodes.units}) as unit
    where ${providerEpisodes.anilistId} = ${series.anilistId}
      and ${providerEpisodes.provider} = ${aniKoto.id}
      and (unit ->> 'number')::numeric = ${titleEpisode.number}
  )`;

/** Whether a stored episode aired within the time TMDB's change log of it is read for. */
const airedLately = sql`${releaseTime} between now() - make_interval(secs => ${editsWindowMs / 1000}) and now()`;

/** Whether a stored episode has no title, or only TMDB's "Episode N". */
const isUnnamed = sql`(${titleEpisode.title} is null or ${titleEpisode.title} ~* '^episode [0-9]+$')`;

/** The graphile-worker task that fills in details TMDB added after an episode aired. */
export const refreshDetailsTask = "refresh-episode-details";

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
 * How often is up to {@link Absence.recheckAfter}: every run for the first two
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
	/**
	 * How far apart the runs of {@link refreshEpisodeDetails} are, as the
	 * scheduler's crontab has it. TMDB's CDN answers a change log's request with
	 * the same copy for ten minutes, so runs any closer would be answered with
	 * what the run before got.
	 */
	const runEveryMs = 12 * minute;

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
      ${titleEpisode.tmdbSeasonNumber} as season_number,
      ${titleEpisode.tmdbEpisodeNumber} as episode_number,
      (extract(epoch from now() - ${releaseTime}) * 1000)::float8 as missing_for_ms
    from ${titleEpisode}
    inner join ${series} on ${series.id} = ${titleEpisode.seriesId}
    left join lateral (
      select
        earlier.number,
        earlier.title is not null and earlier.title !~* '^episode [0-9]+$' as is_named,
        earlier.overview,
        earlier.still_url
      from series_episode as earlier
      where earlier.series_id = ${series.id}
        and earlier.tmdb_episode_number is not null
        and earlier.number < ${titleEpisode.number}
      order by earlier.number desc
      limit 1
    ) as previous on true
    where ${series.key} ~ '^(tv|shorts):[0-9]+$'
      and ${titleEpisode.tmdbEpisodeNumber} is not null
      and ${airedLately}
      and (
        (${isUnnamed} and coalesce(previous.is_named, true))
        or (${titleEpisode.overview} is null and (previous.number is null or previous.overview is not null))
        or (${titleEpisode.stillUrl} is null and (previous.number is null or previous.still_url is not null))
      )
      and ${onAniKoto}
  `);

	const copied = await sequence.all(
		[...Map.groupBy(awaited, (episode) => episode.series_id)],
		async ([seriesId, episodes]) => {
			const showId = episodes[0]?.show_id;

			if (showId === undefined) {
				return 0;
			}

			const show = await attempt(
				getShow(showId, {
					maxAgeMs: storedShowMs,
				}),
				UpstreamUnavailableError,
			);

			if (show.error) {
				helpers.logger.warn(`TMDB failed for show ${showId}: ${show.error.message}`);

				return 0;
			}

			const edited = await attempt(
				Promise.all(
					episodes.flatMap((episode) => {
						const listed = show.data?.episodes.find(
							(candidate) =>
								candidate.season_number === episode.season_number &&
								candidate.episode_number === episode.episode_number,
						);

						if (!listed) {
							return [];
						}

						const recheckMs = new Absence(episode.missing_for_ms).recheckAfter({
							max: editsWindowMs,
							min: runEveryMs,
						});

						return [
							withEdits(listed, {
								// A minute short, so a run is never a moment too early for it.
								maxAgeMs: recheckMs - minute,
							}),
						];
					}),
				),
				UpstreamUnavailableError,
			);

			if (edited.error) {
				helpers.logger.warn(`TMDB failed for show ${showId}: ${edited.error.message}`);

				return 0;
			}

			return await new StoredEpisodes(seriesId).copy(await withChoices(showId, edited.data));
		},
	);

	let updated = 0;

	for (const count of copied) {
		updated += count;
	}

	if (updated > 0) {
		helpers.logger.info(
			`Filled in ${updated} of ${awaited.length} episodes awaiting details from TMDB`,
		);
	}
};

/** The graphile-worker task that picks up episodes TMDB starts to list. */
export const refreshListingsTask = "refresh-episode-listings";

/**
 * Asks TMDB again for the shows of stored series with an episode that a
 * series lists, or would, and that TMDB is behind on:
 *
 * - one AniKoto carries that TMDB does not list, which a series lists
 *   without details until TMDB does, however long that takes.
 *   The show is asked for as often as {@link Absence.recheckAfter} says: hourly
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
 * again as often as {@link Absence.recheckAfter} says, from hourly while the
 * episode is new to daily.
 *
 * Measured on 198 series with an unlisted episode and 17 with one lacking
 * details, that is about 25 requests a day. An unmatched entry costs at most
 * about 45 layouts over the twelve days after an episode, ten of them in the
 * first ten hours, and none once it is matched; two had a new episode.
 */
export const refreshEpisodeListings: Task = async (_payload, helpers) => {
	// Finished standalone titles have no airing job to revisit a failed
	// match. Retry them monthly, and apply successful mappings resolved
	// after the last layout, including those resolved through a sequel.
	const staleMappings = await db.execute<{
		anilist_id: number;
		retry_match: boolean;
	}>(sql`
    select ${series.anilistId} as anilist_id,
      (${tmdbMapping.tmdbId} is null) as retry_match
    from ${series}
    inner join ${tmdbMapping} on ${tmdbMapping.anilistId} = ${series.anilistId}
    where (
      (${tmdbMapping.tmdbId} is not null and ${tmdbMapping.resolvedAt} > ${series.laidOutAt})
      or (
        ${series.kind} = 'standalone'
        and ${tmdbMapping.tmdbId} is null
        and ${series.status} = 'FINISHED'
        and ${tmdbMapping.resolvedAt} < now() - interval '30 days'
        and ${series.laidOutAt} < now() - interval '30 days'
      )
    )
    order by ${series.laidOutAt}
    limit 50
  `);

	await sequence.all([...staleMappings], async (row) => {
		if (row.retry_match) {
			await mappings.expire(row.anilist_id);
		}

		await scheduleRefresh(row.anilist_id);
	});

	const unlisted = sql`(
    ${series.kind} = 'tv'
    and ${titleEpisode.tmdbEpisodeNumber} is null
  )`;

	const lacksDetails = sql`(
    ${airedLately}
    and (${isUnnamed} or ${titleEpisode.overview} is null or ${titleEpisode.stillUrl} is null)
  )`;

	const rows = await db.execute(sql`
    select
      ${series.id} as series_id,
      ${series.key} as key,
      ${series.anilistId} as anilist_id,
      bool_or(${unlisted}) as is_unlisted,
      (extract(epoch from now() - max(${releaseTime}) filter (where ${unlisted})) * 1000)::float8 as unlisted_for_ms,
      bool_or(${lacksDetails}) as lacks_details,
      (extract(epoch from now() - max(${releaseTime}) filter (where ${lacksDetails})) * 1000)::float8 as lacking_for_ms,
      (extract(epoch from now() - ${series.laidOutAt}) * 1000)::float8 as laid_out_for_ms
    from ${titleEpisode}
    inner join ${series} on ${series.id} = ${titleEpisode.seriesId}
    where (${unlisted} or ${lacksDetails})
      and ${onAniKoto}
    group by ${series.id}
  `);

	const behind = z.array(Behind.schema).parse([...rows]);

	const showIds = new Map(
		behind.flatMap(({ series_id, key }) => {
			const showId = /^(?:tv|shorts):(?<id>\d+)$/u.exec(key)?.[1];

			if (showId) {
				return [[series_id, Number(showId)] as const];
			}

			return [];
		}),
	);

	// When each show was last fetched, so one fetched lately is not even read.
	const paths = [...new Set(showIds.values())].map((showId) => `/tv/${showId}`);

	let fetchedRows: {
		at: Date;
		path: string;
	}[] = [];

	if (paths.length > 0) {
		fetchedRows = await db
			.select({
				at: sql<Date>`max(${tmdbResponse.fetchedAt})`.mapWith(tmdbResponse.fetchedAt),
				path: tmdbResponse.path,
			})
			.from(tmdbResponse)
			.where(inArray(tmdbResponse.path, paths))
			.groupBy(tmdbResponse.path);
	}

	const fetchedAt = new Map(fetchedRows.map(({ path, at }) => [path, at.getTime()] as const));

	const outcomes = await sequence.all(behind, async (row) => {
		const showId = showIds.get(row.series_id);

		if (showId === undefined) {
			return await new Behind(row).relayout();
		}

		return await new Behind(row).refresh(showId, fetchedAt, helpers.logger);
	});

	let fetched = 0;
	let updated = 0;
	let queued = 0;

	for (const outcome of outcomes) {
		fetched += outcome.fetched;
		updated += outcome.updated;
		queued += outcome.queued;
	}

	helpers.logger.info(
		`Asked TMDB for ${fetched} of ${showIds.size} shows it is behind on, filled in ${updated} episodes, and queued ${queued} of ${behind.length} series to be laid out again`,
	);
};
