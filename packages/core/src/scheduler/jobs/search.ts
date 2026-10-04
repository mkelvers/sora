import { and, desc, eq, gte, notExists, or, sql } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { currentSeason, nextSeason } from "../../catalog/queries/browse";
import { syncSearchIndex } from "../../catalog/queries/search";
import { db } from "../../database/client";
import { animeSearch, series } from "../../database/schema";
import { carriedByAniKoto } from "../../series/episodes";
import { scheduleSeriesStore, seriesStorePriority, storeSeriesTask } from "../queue";

const SyncSearchIndexPayloadSchema = z
	.object({
		full: z.boolean().optional(),
	})
	.nullish();

/** Backfill layouts {@link backfillSeries} keeps queued; more than half an hour of AniList's rate limit lays out. */
const backfillBatchSize = 200;

/**
 * How popular on AniList an entry must be for {@link backfillSeries} to store
 * its series ahead of any search. A less popular title is laid out when a
 * search first finds it instead, within seconds, ahead of all other work;
 * storing every one of them ahead of time would take AniList's requests for
 * days.
 */
const backfillMinimumPopularity = 1000;

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
		full: payload?.full === true,
	});
	helpers.logger.info(`Indexed ${stored} anime from ${pages} AniList pages`);
};

/** The graphile-worker task that queues popular titles to be stored. */
export const backfillSeriesTask = "backfill-series";

/**
 * Queues the most popular indexed entries whose series is not stored yet,
 * so searches find titles already laid out instead of laying them out while
 * someone waits. Only entries at least {@link backfillMinimumPopularity}
 * popular are stored this way, besides this season's and the next's (see
 * {@link queueSeasons}).
 *
 * Entries that already have a store job, waiting or failed for good, are
 * left alone, so an entry that cannot be laid out does not hold up the
 * rest. Runs every half hour until the whole catalogue is stored.
 *
 * Only tops the backfill queue up to {@link backfillBatchSize}, counting
 * related titles and new entries queued there too. Layouts wait on AniList,
 * so a full batch every run outgrew what AniList lays out and piled up
 * thousands of layouts that stay queued for days.
 */
export const backfillSeries: Task = async (_payload, helpers) => {
	await queueSeasons(helpers);

	const [{ queued } = { queued: 0 }] = await db.execute<{ queued: number }>(sql`
    select count(*)::int as queued
    from graphile_worker.jobs
    where task_identifier = ${storeSeriesTask}
      and priority >= ${seriesStorePriority("backfill")}
      and attempts < max_attempts
  `);
	const room = backfillBatchSize - queued;
	if (room <= 0) {
		return;
	}

	const rows = await db
		.select({
			anilistId: animeSearch.anilistId,
		})
		.from(animeSearch)
		.where(
			and(
				eq(animeSearch.isAdult, false),
				gte(animeSearch.popularity, backfillMinimumPopularity),
				sql`${animeSearch.format} is distinct from 'MUSIC'`,
				notExists(db.select().from(series).where(eq(series.anilistId, animeSearch.anilistId))),
				sql`not exists (select 1 from graphile_worker.jobs where jobs.key = 'series:' || ${animeSearch.anilistId})`,
			),
		)
		.orderBy(desc(animeSearch.popularity))
		.limit(room);

	for (const row of rows) {
		await scheduleSeriesStore(row.anilistId, "backfill");
	}

	if (rows.length > 0) {
		helpers.logger.info(`Queued ${rows.length} popular entries to store their series`);
	}
};

/**
 * Queues the entries of this season and the next that AniKoto carries and
 * whose series is not stored yet, however popular they are, so a season's
 * simulcasts are laid out before anyone browses it. Announced titles are
 * rarely popular yet, so {@link backfillSeries} would not reach them.
 *
 * Not held to {@link backfillBatchSize}: two seasons are a few hundred
 * entries, queued once, and popular backfill must not keep them waiting.
 * Queued as backfill, so they never delay new episodes or a viewer.
 */
async function queueSeasons(helpers: Parameters<Task>[1]) {
	const current = currentSeason();
	const rows = await db
		.select({
			anilistId: animeSearch.anilistId,
		})
		.from(animeSearch)
		.where(
			and(
				eq(animeSearch.isAdult, false),
				sql`${animeSearch.format} is distinct from 'MUSIC'`,
				or(
					...[current, nextSeason(current)].map((season) =>
						and(eq(animeSearch.season, season.season), eq(animeSearch.seasonYear, season.year)),
					),
				),
				carriedByAniKoto,
				notExists(db.select().from(series).where(eq(series.anilistId, animeSearch.anilistId))),
				sql`not exists (select 1 from graphile_worker.jobs where jobs.key = 'series:' || ${animeSearch.anilistId})`,
			),
		)
		.orderBy(desc(animeSearch.popularity));

	for (const row of rows) {
		await scheduleSeriesStore(row.anilistId, "backfill");
	}

	if (rows.length > 0) {
		helpers.logger.info(
			`Queued ${rows.length} entries of this season and the next to store their series`,
		);
	}
}
