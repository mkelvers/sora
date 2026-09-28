import { and, eq, gte, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { anilist } from "../../anilist/client";
import { NewEntriesDocument } from "../../anilist/graphql.generated";
import { fuzzyDate } from "../../catalog/models/text";
import { db } from "../../database/client";
import { animeSearch, providerEpisodes, series, seriesEpisode, seriesSeason } from "../../database/schema";
import { AnimeNotFoundError } from "../../errors";
import { aniKoto } from "../../playback/providers/registry";
import { relatedIds } from "../../series/entries";
import { storedSeriesIds, storeSeries } from "../../series/store";
import { getShow, tmdbImageUrl, type TmdbShow } from "../../tmdb/resources";
import { day, hour } from "../../time";
import { scheduleSeriesStore, scheduleStoredSeriesRefresh } from "../queue";

const StoreSeriesPayloadSchema = z.object({
  anilistId: z.number().int().positive(),
});

/**
 * Lays out and stores the series one AniList entry belongs to.
 *
 * Queued for a new entry that continues a stored series, for related titles
 * of a stored series, and while an entry of a stored series airs. Throwing
 * lets graphile-worker retry with backoff, which is how an AniList or TMDB
 * outage is handled.
 */
export const storeSeriesJob: Task = async (rawPayload, helpers) => {
  const {
    anilistId,
  } = StoreSeriesPayloadSchema.parse(rawPayload);
  try {
    const seriesId = await storeSeries(anilistId);
    helpers.logger.info(`Stored series ${seriesId} for anime ${anilistId}`);
  } catch (error) {
    if (error instanceof AnimeNotFoundError) {
      // Searches queue every entry they find that is not stored, so an entry
      // left in the index would be queued again by each one. A sync puts it
      // back should AniList serve it again.
      await db.delete(animeSearch).where(eq(animeSearch.anilistId, anilistId));
      helpers.logger.warn(`Anime ${anilistId} is gone from AniList; not storing its series`);
      return;
    }

    throw error;
  }
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
 *   they join their series.
 *
 * Whether an entry is a new season, a later part, or a title of its own is
 * decided when it is stored. An entry that qualifies for none of these yet
 * is simply looked at again on the next run.
 */
export const discoverSeriesEntries: Task = async (_payload, helpers) => {
  const premiereCutoff = new Date(Date.now() + premiereWindowMs).toISOString().slice(0, 10);
  let queued = 0;
  for (let page = 1; page <= discoveryPageLimit; page += 1) {
    const {
      Page,
    } = await anilist(
      NewEntriesDocument,
      {
        page,
        perPage: entriesPerPage,
      },
      {
        maxAgeMs: hour,
      }
    );

    const entries = (Page?.media ?? []).flatMap((media) => (media && media.format !== "MUSIC" ? [media] : []));
    const stored = await storedSeriesIds([
      ...entries.map((entry) => entry.id),
      ...entries.flatMap((entry) => relatedIds(entry))
    ]);

    for (const entry of entries) {
      const startDate = entry.startDate ? fuzzyDate(entry.startDate) : null;
      const premieresSoon = startDate !== null && startDate.length === 10 && startDate <= premiereCutoff;
      const isWanted =
        entry.status === "RELEASING" || premieresSoon || relatedIds(entry).some((id) => stored.has(id));
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
 * How long after an episode airs its missing TMDB details are looked for.
 * TMDB often has only a title on the day an episode airs.
 */
const detailsWindowMs = 14 * day;

/** The graphile-worker task that fills in details TMDB added after an episode aired. */
export const refreshEpisodeDetailsTask = "refresh-episode-details";

/**
 * Brings every stored series with an episode missing TMDB details up to
 * date:
 *
 * - one AniKoto carries that TMDB does not list yet, which a season does not
 *   list until TMDB does (see `isEpisodeShown`), however long that takes.
 *   Listing it changes the layout, so the series is queued to be laid out
 *   again.
 * - one that aired within {@link detailsWindowMs} and still has no title
 *   other than TMDB's "Episode N", no overview, or no still, going by when
 *   AniList says it aired when it knows. Tracking an anime stops once its
 *   last episode airs, and that layout runs before TMDB has usually filled
 *   the episode in, so without this a finale keeps its bare title. The
 *   details are copied from TMDB straight into the stored episodes: a layout
 *   needs AniList, whose requests go to more urgent jobs first, so a queued
 *   one can wait for hours.
 *
 * Each such series' TMDB show is fetched anew first, so both read what TMDB
 * has now rather than a copy up to half a day old.
 */
export const refreshEpisodeDetails: Task = async (_payload, helpers) => {
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - detailsWindowMs).toISOString().slice(0, 10);
  const onAniKoto = sql`exists (
    select 1
    from ${providerEpisodes}, jsonb_array_elements(${providerEpisodes.units}) as unit
    where ${providerEpisodes.anilistId} = ${seriesEpisode.anilistId}
      and ${providerEpisodes.provider} = ${aniKoto.id}
      and (unit ->> 'number')::numeric = ${seriesEpisode.anilistEpisode}
  )`;
  // AniList's broadcast time, in UTC, over TMDB's date in the airing country's calendar.
  const airedOn = sql<string>`coalesce(to_char(${seriesEpisode.airedAt} at time zone 'UTC', 'YYYY-MM-DD'), ${seriesEpisode.airDate})`;
  const unlisted = and(eq(series.kind, "tv"), ne(seriesSeason.kind, "movie"), isNull(seriesEpisode.tmdbEpisodeNumber), onAniKoto);
  const stale = await db
    .select({
      seriesId: series.id,
      key: series.key,
      anilistId: sql<number>`min(${seriesEpisode.anilistId})`,
      needsLayout: sql<boolean>`bool_or(coalesce(${unlisted}, false))`,
    })
    .from(seriesEpisode)
    .innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
    .innerJoin(series, eq(series.id, seriesSeason.seriesId))
    .where(
      and(
        isNotNull(seriesEpisode.anilistId),
        or(
          unlisted,
          and(
            gte(airedOn, since),
            lte(airedOn, today),
            or(
              isNull(seriesEpisode.title),
              sql`${seriesEpisode.title} ~* '^episode [0-9]+$'`,
              isNull(seriesEpisode.overview),
              isNull(seriesEpisode.stillUrl)
            )
          )
        )
      )
    )
    .groupBy(series.id);

  let updated = 0;
  let queued = 0;
  for (const { seriesId, key, anilistId, needsLayout } of stale) {
    const showId = /^tv:(\d+)$/.exec(key)?.[1];
    let show: TmdbShow | null = null;
    if (showId) {
      try {
        show = await getShow(Number(showId), {
          maxAgeMs: 0,
        });
      } catch (error) {
        helpers.logger.warn(`TMDB failed for show ${showId}: ${String(error)}`);
      }
    }

    if (show) {
      updated += await copyEpisodeDetails(seriesId, show);
    }

    // A film's details, and those of a show TMDB could not serve, only come with a layout.
    if (needsLayout || !show) {
      await scheduleStoredSeriesRefresh(anilistId);
      queued += 1;
    }
  }

  helpers.logger.info(
    `Filled in ${updated} episodes from TMDB and queued ${queued} of ${stale.length} series with episodes missing TMDB details`
  );
};

/**
 * Copies TMDB's current details onto a stored series' episodes, as a layout
 * would derive them (see `layoutShowSeasons`). Returns how many episodes
 * changed.
 */
async function copyEpisodeDetails(seriesId: string, show: TmdbShow) {
  const tmdbEpisodes = new Map(show.episodes.map((episode) => [`${episode.season_number}:${episode.episode_number}`, episode]));
  const stored = await db
    .select({
      seasonId: seriesEpisode.seasonId,
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
    .innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
    .where(and(eq(seriesSeason.seriesId, seriesId), isNotNull(seriesEpisode.tmdbEpisodeNumber)));

  let changed = 0;
  for (const episode of stored) {
    const tmdbEpisode = tmdbEpisodes.get(`${episode.tmdbSeasonNumber}:${episode.tmdbEpisodeNumber}`);
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
    if (Object.entries(details).every(([name, value]) => episode[name as keyof typeof details] === value)) {
      continue;
    }

    await db
      .update(seriesEpisode)
      .set(details)
      .where(and(eq(seriesEpisode.seasonId, episode.seasonId), eq(seriesEpisode.number, episode.number)));
    changed += 1;
  }

  return changed;
}
