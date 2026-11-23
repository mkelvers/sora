import { and, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { db } from "../../database/client";
import { animeSearch } from "../../database/schema/catalog";
import { series, seriesRelated } from "../../database/schema/series";
import { toSeriesCards } from "../../series/queries";

/** A format worth recommending. */
type Format = "TV" | "MOVIE";

/** What a row of recommendations holds. */
export interface Filter {
	/** Genres a title shares with these, at least `sharing` of them; unfiltered when omitted. */
	genres?: readonly string[];
	sharing?: number;
	format?: Format;
	minimumScore?: number;
	minimumPopularity?: number;
	order: "popularity" | "score";
}

/** The stored titles recommendations are drawn from, leaving out titles a profile has seen. */
export class Pool {
	/** Formats worth recommending: shows and films, not music videos, specials, or OVAs. */
	static readonly #formats: readonly Format[] = ["TV", "MOVIE"];

	/** What a recommendation must reach: well liked and widely known. */
	static readonly #wellLiked = {
		popularity: 20_000,
		score: 70,
	};

	readonly #excluded: ReadonlySet<string>;

	/** @param excluded - Title keys never recommended. */
	constructor(excluded: ReadonlySet<string>) {
		this.#excluded = excluded;
	}

	/**
	 * Stored titles that suit a row, the best first, one per TMDB title and
	 * leaving out the excluded ones. Entries with a prequel are left out, so a
	 * sequel is never recommended ahead of the season it follows.
	 */
	async candidates(filter: Filter) {
		const excluded = this.#excluded;

		/** Candidates read for each row, since some are left out for having nothing to stream. */
		const candidatesPerRow = 60;

		let shared = sql<number>`0`;
		let formats: Format[] = [...Pool.#formats];
		let ranking = desc(animeSearch.popularity);

		if (filter.genres) {
			const genres = sql`array[${sql.join(
				filter.genres.map((genre) => sql`${genre}`),
				sql`, `,
			)}]::text[]`;

			shared = sql<number>`(select count(*) from jsonb_array_elements_text(${animeSearch.genres}) as genre where genre = any(${genres}))`;
		}

		if (filter.format) {
			formats = [filter.format];
		}

		if (filter.order === "score") {
			ranking = desc(animeSearch.averageScore);
		}

		const conditions: (SQL | undefined)[] = [
			eq(animeSearch.isAdult, false),
			inArray(animeSearch.format, formats),
			inArray(animeSearch.status, ["RELEASING", "FINISHED"]),
			gte(animeSearch.averageScore, filter.minimumScore ?? Pool.#wellLiked.score),
			gte(animeSearch.popularity, filter.minimumPopularity ?? Pool.#wellLiked.popularity),
		];

		const ordering: SQL[] = [];

		if (filter.genres) {
			conditions.push(sql`${shared} >= ${filter.sharing ?? 1}`);
			ordering.push(desc(shared));
		}

		if (excluded.size > 0) {
			conditions.push(notInArray(series.key, [...excluded]));
		}

		conditions.push(sql`not exists (
			select 1 from ${seriesRelated}
			where ${seriesRelated.seriesId} = ${series.id} and ${seriesRelated.relation} = 'PREQUEL'
		)`);
		ordering.push(ranking, desc(animeSearch.popularity));

		const rows = await db
			.select({
				row: series,
				shared,
			})
			.from(series)
			.innerJoin(animeSearch, eq(animeSearch.anilistId, series.anilistId))
			.where(and(...conditions))
			.orderBy(...ordering)
			.limit(candidatesPerRow);

		const found: (typeof series.$inferSelect)[] = [];
		const keys = new Set<string>();

		for (const { row } of rows) {
			if (!keys.has(row.key)) {
				keys.add(row.key);
				found.push(row);
			}
		}

		const cards = await toSeriesCards(found);

		return found.flatMap((row) => {
			const card = cards.get(row.id);

			if (card && card.audio.length > 0) {
				return [
					{
						card,
						key: row.key,
					},
				];
			}

			return [];
		});
	}
}
