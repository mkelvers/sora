import type { Task } from "graphile-worker";
import { and, desc, eq, notExists, sql } from "drizzle-orm";
import { z } from "zod";

import { syncSearchIndex } from "../../catalog/queries/search";
import { db } from "../../database/client";
import { animeSearch, seriesEntry } from "../../database/schema";
import { scheduleSeriesStore } from "../queue";

const SyncSearchIndexPayloadSchema = z
  .object({
    full: z.boolean().optional()
  })
  .nullish();

/** Entries {@link backfillSeries} queues per run; about what half an hour of AniList's rate limit lays out. */
const backfillBatchSize = 200;

/** The graphile-worker task that keeps the search index current. */
export const syncSearchIndexTask = "sync-search-index";

/**
 * Brings the search index up to date with AniList.
 *
 * Runs hourly for entries AniList added or changed, and weekly with
 * `{ full: true }` to refresh every entry's popularity. The first run, with
 * nothing stored, reads the whole catalogue: about 400 requests.
 */
export const syncSearchIndexJob: Task = async (rawPayload, helpers) => {
  const payload = SyncSearchIndexPayloadSchema.parse(rawPayload);
  const { pages, stored } = await syncSearchIndex({
    full: payload?.full === true
  });
  helpers.logger.info(`Indexed ${stored} anime from ${pages} AniList pages`);
};

/** The graphile-worker task that queues popular titles to be stored. */
export const backfillSeriesTask = "backfill-series";

/**
 * Queues the most popular indexed entries whose series is not stored yet,
 * so searches find titles already laid out instead of laying them out while
 * someone waits.
 *
 * Entries that already have a store job, waiting or failed for good, are
 * left alone, so an entry that cannot be laid out does not hold up the
 * rest. Runs every half hour until the whole catalogue is stored.
 */
export const backfillSeries: Task = async (_payload, helpers) => {
  const rows = await db
    .select({
      anilistId: animeSearch.anilistId
    })
    .from(animeSearch)
    .where(
      and(
        eq(animeSearch.isAdult, false),
        sql`${animeSearch.format} is distinct from 'MUSIC'`,
        notExists(db.select().from(seriesEntry).where(eq(seriesEntry.anilistId, animeSearch.anilistId))),
        sql`not exists (select 1 from graphile_worker.jobs where jobs.key = 'series:' || ${animeSearch.anilistId})`
      )
    )
    .orderBy(desc(animeSearch.popularity))
    .limit(backfillBatchSize);

  for (const row of rows) {
    await scheduleSeriesStore(row.anilistId, "backfill");
  }

  if (rows.length > 0) {
    helpers.logger.info(`Queued ${rows.length} popular entries to store their series`);
  }
};
