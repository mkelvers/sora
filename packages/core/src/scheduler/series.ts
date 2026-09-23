import type { Task } from "graphile-worker";
import { z } from "zod";

import { anilist } from "../anilist/client";
import { NewEntriesDocument } from "../anilist/graphql.generated";
import { AnimeNotFoundError } from "../errors";
import { relatedIds } from "../series/entries";
import { storedSeriesIds, storeSeries } from "../series/store";
import { hour } from "../time";
import { scheduleSeriesStore } from "./queue";

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

/**
 * Finds new AniList entries that belong with a stored series, such as a newly
 * announced season, and queues storing them so they join it.
 *
 * Reads every upcoming and airing entry and picks those that are not stored
 * but are related to a stored entry. Whether an entry is a new season, a
 * later part, or a film of its own is decided when it is stored. An entry
 * whose AniList relations do not link it to anything stored yet is simply
 * looked at again on the next run.
 */
export const discoverSeriesEntries: Task = async (_payload, helpers) => {
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
      if (!stored.has(entry.id) && relatedIds(entry).some((id) => stored.has(id))) {
        await scheduleSeriesStore(entry.id);
        queued += 1;
      }
    }

    if (Page?.pageInfo?.hasNextPage !== true) {
      break;
    }
  }

  if (queued > 0) {
    helpers.logger.info(`Queued ${queued} new entries to join their series`);
  }
};
