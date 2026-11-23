import { chunked, day, hour, inSequence } from "@sora/shared";
import { lt, max, sql } from "drizzle-orm";
import type { Task } from "graphile-worker";

import { anilist } from "../../anilist/client";
import { MediaTrendsDocument } from "../../anilist/graphql.generated";
import { zMediaTrendsQuery } from "../../anilist/validation.generated";
import { db } from "../../database/client";
import { animeSearch, animeTrend } from "../../database/schema/catalog";
import { worthFeaturing } from "../../library/featured/featured";
import { activityKeptFor, dateBefore } from "../../library/featured/rotation";

/** The graphile-worker task that stores AniList's daily activity of the titles the home page may feature. */
export const storeActivityTask = "store-anime-trends";

/** The whole days AniList recorded for some entries after a moment and before now. */
class Trends {
	readonly #ids: readonly number[];
	readonly #after: number;
	readonly #now: number;

	/**
	 * @param after - A Unix timestamp, in seconds.
	 * @param now - In milliseconds.
	 */
	constructor(ids: readonly number[], after: number, now: number) {
		this.#ids = ids;
		this.#after = after;
		this.#now = now;
	}

	/** Reads the days, page by page. */
	async fetch() {
		const rows: (typeof animeTrend.$inferInsert)[] = [];
		await this.#read(1, rows);

		return rows;
	}

	async #read(page: number, rows: (typeof animeTrend.$inferInsert)[]): Promise<void> {
		const { Page } = await anilist(
			MediaTrendsDocument,
			{
				after: this.#after,
				ids: [...this.#ids],
				page,
			},
			zMediaTrendsQuery,
			{
				maxAgeMs: hour,
			},
		);

		for (const trend of Page?.mediaTrends ?? []) {
			// A day still under way would count as a quiet one.
			if (trend && trend.date * 1000 + day <= this.#now) {
				rows.push({
					anilistId: trend.mediaId,
					day: new Date(trend.date * 1000).toISOString().slice(0, 10),
					popularity: trend.popularity,
					trending: trend.trending,
				});
			}
		}

		if (Page?.pageInfo?.hasNextPage) {
			await this.#read(page + 1, rows);
		}
	}
}

/**
 * Stores AniList's daily activity of every entry the home page may feature
 * (see `worthFeaturing`), so it can tell a title people are coming back to
 * from one past its moment, and drops days older than it reads.
 *
 * Runs daily at 05:30 UTC, before the featured titles change. An entry
 * already stored is asked only for the days since its newest; a new one for
 * the whole month, once. About a hundred entries a day are a few requests.
 */
export const storeActivity: Task = async (_payload, helpers) => {
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
		.where(worthFeaturing(now));

	// Entries are asked for together by the day they are known up to, so a
	// request covers only days some of them miss.
	const bySince = Map.groupBy(entries, (entry) => entry.newest ?? oldest);

	const groups = [...bySince].flatMap(([since, group]) =>
		chunked(
			group.map((entry) => entry.anilistId),
			entriesPerRequest,
		).map((ids) => ({
			// The Unix timestamp, in seconds, just before the start of that day in UTC.
			after: Date.parse(`${since}T00:00:00Z`) / 1000 - 1,
			ids,
		})),
	);

	const fetched = await inSequence(groups, ({ ids, after }) =>
		new Trends(ids, after, now.getTime()).fetch(),
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
