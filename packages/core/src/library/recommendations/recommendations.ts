import { and, desc, eq, gte, inArray, isNotNull, max, notInArray, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { animeSearch } from "../../database/schema/catalog";
import { episodeProgress, seriesState } from "../../database/schema/library";
import { series, seriesRelated } from "../../database/schema/series";
import type { Recommendations } from "../../models/series";
import { toSeriesCards } from "../../series/queries";

/** The fewest titles a row needs; a shorter one looks unfinished and is left out. */
const minimumRowSize = 8;

/** The most titles a row holds. */
const rowSize = 20;

/** Candidates read for each row, since some are left out for having nothing to stream. */
const candidatesPerRow = 60;

/** How many rows are built from a single title the profile watched, and from their genres. */
const becauseRows = 2;
const genreRows = 2;

/** Formats worth recommending: shows and films, not music videos, specials, or OVAs. */
const recommendedFormats = ["TV", "MOVIE"] as const;

/** What a recommendation must reach: well liked and widely known. */
const wellLiked = {
	popularity: 20_000,
	score: 70,
};

/** How much a title on the watchlist, or one played without being listed, says about taste. */
const tasteWeight = {
	completed: 3,
	dropped: 0,
	plan_to_watch: 1,
	played: 1,
	watching: 2,
} as const;

interface Taste {
	/** Every title key the profile has played or listed, which is never recommended. */
	seen: Set<string>;
	/** Titles the profile likes, the most recent first, with their genres. */
	liked: { genres: string[]; title: string }[];
	/** Genres in order of how much of the profile's viewing they cover. */
	genres: string[];
}

/** What the profile's watchlist and playback say about what it likes. */
const tasteOf = async (userId: string): Promise<Taste> => {
	const [played, states] = await Promise.all([
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
	]);

	const signals = new Map<string, { at: number; weight: number }>();
	const note = (seriesId: string, at: Date | null, weight: number) => {
		const known = signals.get(seriesId);
		signals.set(seriesId, {
			at: Math.max(known?.at ?? 0, at?.getTime() ?? 0),
			weight: Math.max(known?.weight ?? 0, weight),
		});
	};
	for (const row of played) {
		note(row.seriesId, row.at, tasteWeight.played);
	}

	for (const row of states) {
		note(row.seriesId, row.at, tasteWeight[row.status ?? "played"]);
	}

	if (signals.size === 0) {
		return { genres: [], liked: [], seen: new Set() };
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
	const liked: (Taste["liked"][number] & { at: number })[] = [];
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

		if (genres.length > 0 && !likedKeys.has(row.key)) {
			likedKeys.add(row.key);
			liked.push({
				at: signal.at,
				genres,
				title: row.title,
			});
		}
	}

	return {
		genres: [...weights.entries()]
			.toSorted((left, right) => right[1] - left[1])
			.map(([name]) => name),
		liked,
		seen,
	};
};

const genreList = (genres: readonly string[]) =>
	sql`array[${sql.join(
		genres.map((genre) => sql`${genre}`),
		sql`, `,
	)}]::text[]`;

interface Filter {
	/** Genres a title shares with these, at least `sharing` of them; unfiltered when omitted. */
	genres?: readonly string[];
	sharing?: number;
	format?: (typeof recommendedFormats)[number];
	minimumScore?: number;
	minimumPopularity?: number;
	order: "popularity" | "score";
}

/**
 * Stored titles that suit a row, the best first, one per TMDB title and
 * leaving out `excluded` ones. Entries with a prequel are left out, so a
 * sequel is never recommended ahead of the season it follows.
 */
const candidates = async (filter: Filter, excluded: ReadonlySet<string>) => {
	const shared = filter.genres
		? sql<number>`(select count(*) from jsonb_array_elements_text(${animeSearch.genres}) as genre where genre = any(${genreList(filter.genres)}))`
		: sql<number>`0`;
	const rows = await db
		.select({
			row: series,
			shared,
		})
		.from(series)
		.innerJoin(animeSearch, eq(animeSearch.anilistId, series.anilistId))
		.where(
			and(
				eq(animeSearch.isAdult, false),
				inArray(animeSearch.format, filter.format ? [filter.format] : [...recommendedFormats]),
				inArray(animeSearch.status, ["RELEASING", "FINISHED"]),
				gte(animeSearch.averageScore, filter.minimumScore ?? wellLiked.score),
				gte(animeSearch.popularity, filter.minimumPopularity ?? wellLiked.popularity),
				filter.genres ? sql`${shared} >= ${filter.sharing ?? 1}` : undefined,
				excluded.size > 0 ? notInArray(series.key, [...excluded]) : undefined,
				sql`not exists (
					select 1 from ${seriesRelated}
					where ${seriesRelated.seriesId} = ${series.id} and ${seriesRelated.relation} = 'PREQUEL'
				)`,
			),
		)
		.orderBy(
			...(filter.genres ? [desc(shared)] : []),
			filter.order === "score" ? desc(animeSearch.averageScore) : desc(animeSearch.popularity),
			desc(animeSearch.popularity),
		)
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
		return card && card.audio.length > 0 ? [{ card, key: row.key }] : [];
	});
};

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
export const getRecommendations = async (userId: string): Promise<Recommendations> => {
	const taste = await tasteOf(userId);
	const specs: { filter: Filter; id: string; title: string }[] = [
		...taste.liked.slice(0, becauseRows).map((favourite, index) => ({
			filter: {
				genres: favourite.genres,
				order: "popularity" as const,
				sharing: Math.min(2, favourite.genres.length),
			},
			id: `because-${index}`,
			title: `Because you watched ${favourite.title}`,
		})),
		...taste.genres.slice(0, genreRows).map((genre) => ({
			filter: {
				genres: [genre],
				order: "popularity" as const,
			},
			id: `genre-${genre.toLowerCase().replaceAll(/\W+/gu, "-")}`,
			title: `More ${genre.toLowerCase()} for you`,
		})),
		{
			filter: {
				minimumPopularity: 40_000,
				minimumScore: 80,
				order: "score",
			},
			id: "highly-rated",
			title: "Highly rated",
		},
		{
			filter: {
				format: "MOVIE",
				order: "popularity",
			},
			id: "films",
			title: "Films worth watching",
		},
	];
	const pools = await Promise.all(specs.map(({ filter }) => candidates(filter, taste.seen)));

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
};
