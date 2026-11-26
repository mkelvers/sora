import type { Recommendations } from "../../models/series";
import { Pool } from "./pool";
import type { Filter } from "./pool";
import { Taste } from "./taste";

export const recommendations = {
	/**
	 * Rows for a profile's home page beyond what is trending, each with a
	 * reason to be there. A profile that played or listed titles gets rows
	 * "Because you watched" a recent favourite, titles sharing its genres, and
	 * rows of its favourite genres; every profile gets the best liked titles
	 * and films it has not seen. Titles it played or listed, in any status, and
	 * every other season of them, are never recommended, and a title shows in
	 * one row only. A row with fewer than {@link minimumRowSize} titles is
	 * dropped.
	 *
	 * Reads only the database.
	 */
	async list(userId: string): Promise<Recommendations> {
		/** How many rows are built from a single title the profile watched, and from their genres. */
		const becauseRows = 2;

		const genreRows = 2;

		/** The most titles a row holds. */
		const rowSize = 20;

		/** The fewest titles a row needs; a shorter one looks unfinished and is left out. */
		const minimumRowSize = 8;

		const taste = await Taste.of(userId);

		const specs: {
			filter: Filter;
			id: string;
			title: string;
		}[] = [
			...taste.liked.slice(0, becauseRows).map((favourite, index) => ({
				filter: {
					genres: favourite.genres,
					order: "popularity" as const,
					sharing: Math.min(2, favourite.genres.length),
				},
				id: `because-${index}`,
				title: `Because You Watched ${favourite.title}`,
			})),
			...taste.genres.slice(0, genreRows).map((genre) => ({
				filter: {
					genres: [genre],
					order: "popularity" as const,
				},
				id: `genre-${genre.toLowerCase().replaceAll(/\W+/gu, "-")}`,
				title: `More ${genre} for You`,
			})),
			{
				filter: {
					minimumPopularity: 40_000,
					minimumScore: 80,
					order: "score",
				},
				id: "highly-rated",
				title: "Highly Rated",
			},
			{
				filter: {
					format: "MOVIE",
					order: "popularity",
				},
				id: "films",
				title: "Films Worth Watching",
			},
		];

		const pool = new Pool(taste.seen);
		const pools = await Promise.all(specs.map(({ filter }) => pool.candidates(filter)));

		const used = new Set<string>();
		const rows: Recommendations = [];

		for (const [index, spec] of specs.entries()) {
			const found = (pools[index] ?? []).filter(({ key }) => !used.has(key)).slice(0, rowSize);

			if (found.length < minimumRowSize) {
				continue;
			}

			for (const { key } of found) {
				used.add(key);
			}

			rows.push({
				id: spec.id,
				series: found.map(({ card }) => card),
				title: spec.title,
			});
		}

		return rows;
	},
};
