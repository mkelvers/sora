import { and, asc, eq, inArray, isNotNull, max } from "drizzle-orm";

import { db } from "../../database/client";
import { animeSearch } from "../../database/schema/catalog";
import { episodeProgress, seriesRating, seriesState } from "../../database/schema/library";
import { series } from "../../database/schema/series";
import type { Recommendations } from "../../models/series";
import { Pool } from "./pool";
import type { Filter } from "./pool";

/** What the profile's watchlist, playback and ratings say about what it likes. */
class Taste {
	/** How much a title on the watchlist, or one played without being listed, says about taste. */
	static readonly #weights = {
		completed: 3,
		dropped: 0,
		plan_to_watch: 1,
		played: 1,
		watching: 2,
	} as const;

	/**
	 * What a rating says about taste, by stars, replacing what playing or listing
	 * the title said: five stars is the strongest like, three is mild, and one or
	 * two stars count against its genres and keep it from being a favourite.
	 */
	static readonly #ratings = new Map([
		[1, -2],
		[2, -1],
		[3, 1],
		[4, 3],
		[5, 4],
	]);

	/** Every title key the profile has played or listed, which is never recommended. */
	readonly seen: Set<string>;
	/** Titles the profile likes, the most recent first, with their genres. */
	readonly liked: {
		genres: string[];
		title: string;
	}[];
	/** Genres in order of how much of the profile's viewing they cover. */
	readonly genres: string[];

	constructor(
		seen: Set<string>,
		liked: {
			genres: string[];
			title: string;
		}[],
		genres: string[],
	) {
		this.seen = seen;
		this.liked = liked;
		this.genres = genres;
	}

	/** What the profile's watchlist and playback say about what it likes. */
	static async of(userId: string): Promise<Taste> {
		const [played, states, rated] = await Promise.all([
			db
				.select({
					at: max(episodeProgress.watchedAt),
					seriesId: episodeProgress.seriesId,
				})
				.from(episodeProgress)
				.where(eq(episodeProgress.userId, userId))
				.groupBy(episodeProgress.seriesId),
			db
				.select({
					at: seriesState.statusChangedAt,
					seriesId: seriesState.seriesId,
					status: seriesState.status,
				})
				.from(seriesState)
				.where(and(eq(seriesState.userId, userId), isNotNull(seriesState.status))),
			db
				.select({
					at: seriesRating.ratedAt,
					rating: seriesRating.rating,
					seriesId: seriesRating.seriesId,
				})
				.from(seriesRating)
				.where(eq(seriesRating.userId, userId)),
		]);

		const signals = new Map<
			string,
			{
				at: number;
				weight: number;
			}
		>();

		const note = (seriesId: string, at: Date | null, weight: number) => {
			const known = signals.get(seriesId);
			signals.set(seriesId, {
				at: Math.max(known?.at ?? 0, at?.getTime() ?? 0),
				weight: Math.max(known?.weight ?? 0, weight),
			});
		};

		for (const row of played) {
			note(row.seriesId, row.at, Taste.#weights.played);
		}

		for (const row of states) {
			note(row.seriesId, row.at, Taste.#weights[row.status ?? "played"]);
		}

		for (const row of rated) {
			const known = signals.get(row.seriesId);
			signals.set(row.seriesId, {
				at: Math.max(known?.at ?? 0, row.at.getTime()),
				weight: Taste.#ratings.get(row.rating) ?? 0,
			});
		}

		if (signals.size === 0) {
			return new Taste(new Set(), [], []);
		}

		const rows = await db
			.select({
				genres: animeSearch.genres,
				id: series.id,
				key: series.key,
				title: series.title,
			})
			.from(series)
			.leftJoin(animeSearch, eq(animeSearch.anilistId, series.anilistId))
			.where(inArray(series.id, [...signals.keys()]));

		const seen = new Set(rows.map((row) => row.key));
		const weights = new Map<string, number>();
		const liked: (Taste["liked"][number] & { key: string })[] = [];
		const likedKeys = new Set<string>();

		for (const row of rows.toSorted(
			(left, right) => (signals.get(right.id)?.at ?? 0) - (signals.get(left.id)?.at ?? 0),
		)) {
			const signal = signals.get(row.id);
			const genres = row.genres ?? [];

			if (!signal || signal.weight === 0) {
				continue;
			}

			for (const genre of genres) {
				weights.set(genre, (weights.get(genre) ?? 0) + signal.weight);
			}

			const enjoyed = signal.weight > 0 && genres.length > 0;

			if (enjoyed && !likedKeys.has(row.key)) {
				likedKeys.add(row.key);
				liked.push({
					genres,
					key: row.key,
					title: row.title,
				});
			}
		}

		const names = await db
			.select({
				key: series.key,
				startDate: series.startDate,
				title: series.title,
			})
			.from(series)
			.innerJoin(animeSearch, eq(animeSearch.anilistId, series.anilistId))
			.where(
				and(
					inArray(series.key, [...likedKeys]),
					inArray(animeSearch.format, ["TV", "ONA", "MOVIE"]),
				),
			)
			.orderBy(asc(series.startDate));

		const showNames = new Map<string, string>();

		for (const { key, title } of names) {
			if (!showNames.has(key)) {
				showNames.set(key, title);
			}
		}

		return new Taste(
			seen,
			liked.map(({ genres, key, title }) => ({
				genres,
				title: showNames.get(key) ?? title,
			})),
			[...weights.entries()]
				.filter(([, weight]) => weight > 0)
				.toSorted((left, right) => right[1] - left[1])
				.map(([name]) => name),
		);
	}
}

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
