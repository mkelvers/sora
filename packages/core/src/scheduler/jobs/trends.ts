import { chunked, day, hour, inSequence } from "@sora/shared";
import { lt, max, sql } from "drizzle-orm";
import type { Task } from "graphile-worker";

import { anilist } from "../../anilist/client";
import { MediaTrendsDocument } from "../../anilist/graphql.generated";
import { zMediaTrendsQuery } from "../../anilist/validation.generated";
import { db } from "../../database/client";
import { animeSearch, animeTrend } from "../../database/schema/catalog";
import { isFeaturedEntry } from "../../library/featured/featured";
import { activityKeptFor, dateBefore } from "../../library/featured/rotation";

/** The graphile-worker task that stores AniList's daily activity of the titles the home page may feature. */
export const storeAnimeTrendsTask = "store-anime-trends";

/** A Unix timestamp, in seconds, of the start of `date` (`YYYY-MM-DD`) in UTC. */
const startOf = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;

/** The whole days AniList recorded for `ids` after `after` (a Unix timestamp) and before `now`, page by page. */
const fetchTrends = async (ids: readonly number[], after: number, now: number) => {
	const rows: (typeof animeTrend.$inferInsert)[] = [];

	const readPage = async (page: number): Promise<void> => {
		const { Page } = await anilist(
			MediaTrendsDocument,
			{
				after,
				ids: [...ids],
				page,
			},
			zMediaTrendsQuery,
			{
				maxAgeMs: hour,
			},
		);

		for (const trend of Page?.mediaTrends ?? []) {
			// A day still under way would count as a quiet one.
			if (trend && trend.date * 1000 + day <= now) {
				rows.push({
					anilistId: trend.mediaId,
					day: new Date(trend.date * 1000).toISOString().slice(0, 10),
					popularity: trend.popularity,
					trending: trend.trending,
				});
			}
		}

		if (Page?.pageInfo?.hasNextPage) {
			await readPage(page + 1);
		}
	};

	await readPage(1);

	return rows;
};

/**
 * Stores AniList's daily activity of every entry the home page may feature
 * (see `isFeaturedEntry`), so it can tell a title people are coming back to
 * from one past its moment, and drops days older than it reads.
 *
 * Runs daily at 05:30 UTC, before the featured titles change. An entry
 * already stored is asked only for the days since its newest; a new one for
 * the whole month, once. About a hundred entries a day are a few requests.
 */
export const storeAnimeTrendsJob: Task = async (_payload, helpers) => {
	/** Entries asked for in one request, so each request's pages stay few. */
	const entriesPerRequest = 100;

	const now = new Date();
	const oldest = dateBefore(now, activityKeptFor);

	const entries = await db
		.select({
			anilistId: animeSearch.anilistId,
			newest: sql<string | null>`(
				select ${max(animeTrend.day)} from ${animeTrend}
				where ${animeTrend.anilistId} = ${animeSearch.anilistId}
					and ${animeTrend.day} >= ${oldest}
			)`,
		})
		.from(animeSearch)
		.where(isFeaturedEntry(now));

	// Entries are asked for together by the day they are known up to, so a
	// request covers only days some of them miss.
	const bySince = Map.groupBy(entries, (entry) => entry.newest ?? oldest);

	const groups = [...bySince].flatMap(([since, group]) =>
		chunked(
			group.map((entry) => entry.anilistId),
			entriesPerRequest,
		).map((ids) => ({
			after: startOf(since) - 1,
			ids,
		})),
	);

	const fetched = await inSequence(groups, ({ ids, after }) =>
		fetchTrends(ids, after, now.getTime()),
	);

	const rows = fetched.flat();

	await inSequence(chunked(rows, 1000), (batch) =>
		db
			.insert(animeTrend)
			.values(batch)
			.onConflictDoUpdate({
				set: {
					popularity: sql`excluded.popularity`,
					trending: sql`excluded.trending`,
				},
				target: [animeTrend.anilistId, animeTrend.day],
			}),
	);
	await db.delete(animeTrend).where(lt(animeTrend.day, oldest));
	helpers.logger.info(
		`Stored ${rows.length} days of AniList activity for ${entries.length} entries`,
	);
};
