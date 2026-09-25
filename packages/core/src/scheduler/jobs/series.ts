import { and, eq, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { anilist } from "../../anilist/client";
import { NewEntriesDocument } from "../../anilist/graphql.generated";
import { fuzzyDate } from "../../catalog/models/text";
import { db } from "../../database/client";
import { seriesEpisode, seriesSeason } from "../../database/schema";
import { AnimeNotFoundError } from "../../errors";
import { relatedIds } from "../../series/entries";
import { storedSeriesIds, storeSeries } from "../../series/store";
import { day, hour } from "../../time";
import { scheduleSeriesStore, scheduleStoredSeriesRefresh } from "../queue";

const StoreSeriesPayloadSchema = z.object({
  anilistId: z.number().int().positive()
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
  const { anilistId } = StoreSeriesPayloadSchema.parse(rawPayload);
  try {
    const seriesId = await storeSeries(anilistId);
    helpers.logger.info(`Stored series ${seriesId} for anime ${anilistId}`);
  } catch (error) {
    if (error instanceof AnimeNotFoundError) {
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
    const { Page } = await anilist(
      NewEntriesDocument,
      {
        page,
        perPage: entriesPerPage
      },
      {
        maxAgeMs: hour
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
 * Queues laying out again every stored series with an episode that aired
 * within {@link detailsWindowMs} and still has no overview or still.
 *
 * Tracking an anime stops once its last episode airs, and that layout runs
 * before TMDB has usually filled the episode in, so without this a finale
 * keeps its bare title.
 */
export const refreshEpisodeDetails: Task = async (_payload, helpers) => {
  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - detailsWindowMs).toISOString().slice(0, 10);
  const stale = await db
    .selectDistinctOn([seriesSeason.seriesId], {
      anilistId: seriesEpisode.anilistId
    })
    .from(seriesEpisode)
    .innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
    .where(
      and(
        isNotNull(seriesEpisode.anilistId),
        gte(seriesEpisode.airDate, since),
        lte(seriesEpisode.airDate, today),
        or(isNull(seriesEpisode.overview), isNull(seriesEpisode.stillUrl))
      )
    );

  for (const { anilistId } of stale) {
    if (anilistId !== null) {
      await scheduleStoredSeriesRefresh(anilistId);
    }
  }

  helpers.logger.info(`Queued ${stale.length} series with episodes missing TMDB details`);
};
