import { and, asc, eq, inArray, isNotNull, max } from "drizzle-orm";

import { db } from "../../database/client";
import { animeSearch } from "../../database/schema/catalog";
import { episodeProgress, seriesRating, seriesState } from "../../database/schema/library";
import { series } from "../../database/schema/series";

/** What one title says about a profile's taste, and when it last said it. */
interface Signal {
	/** Milliseconds since the Unix epoch. */
	at: number;
	weight: number;
}

/** What the profile's watchlist, playback and ratings say about what it likes. */
export class Taste {
	/** How much a title played without being listed says about taste. */
	static readonly #played = 1;

	/**
	 * What a watchlist status says about taste, replacing what playing the
	 * title said: completing it is the strongest sign, and dropping it counts
	 * against its genres.
	 */
	static readonly #statuses = {
		completed: 3,
		dropped: -1,
		plan_to_watch: 1,
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
	/**
	 * How much each genre the profile watched says it likes it: the sum of what
	 * each of its titles says, negative for a genre it mostly dropped or rated
	 * low.
	 */
	readonly weights: ReadonlyMap<string, number>;

	constructor(
		seen: Set<string>,
		liked: {
			genres: string[];
			title: string;
		}[],
		weights: ReadonlyMap<string, number>,
	) {
		this.seen = seen;
		this.liked = liked;
		this.weights = weights;
	}

	/** Genres the profile likes, the ones covering most of its viewing first. */
	get genres(): string[] {
		return [...this.weights.entries()]
			.filter(([, weight]) => weight > 0)
			.toSorted((left, right) => right[1] - left[1])
			.map(([name]) => name);
	}

	/** What the profile's watchlist, playback and ratings say about what it likes. */
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

		const signals = new Map<string, Signal>();

		// Each kind of signal replaces the weight of the ones before it, from
		// the weakest to the most explicit: playing, then a status, then a rating.
		const note = (seriesId: string, at: Date | null, weight: number) => {
			const known = signals.get(seriesId);

			signals.set(seriesId, {
				at: Math.max(known?.at ?? 0, at?.getTime() ?? 0),
				weight,
			});
		};

		for (const row of played) {
			note(row.seriesId, row.at, Taste.#played);
		}

		for (const row of states) {
			if (row.status) {
				note(row.seriesId, row.at, Taste.#statuses[row.status]);
			}
		}

		for (const row of rated) {
			note(row.seriesId, row.at, Taste.#ratings.get(row.rating) ?? 0);
		}

		if (signals.size === 0) {
			return new Taste(new Set(), [], new Map());
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
			weights,
		);
	}
}
