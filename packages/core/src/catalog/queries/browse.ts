import { and, eq, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";

import { anilist } from "../../anilist/client";
import {
	BrowseAnimeDocument,
	GenresDocument,
	type MediaSort,
} from "../../anilist/graphql.generated";
import { db } from "../../database/client";
import { animeSearch } from "../../database/schema";
import { InvalidInputError } from "../../errors";
import type { AnimeSeason } from "../../models/series";
import { day, hour, minute } from "../../time";
import { toAnimeCard, type AnimeCard } from "../models/anime";
import { catalogFormatAllowed, excludedFormats } from "../visibility";
import { BrowseQuerySchema, type BrowseQuery } from "./browse-query";

/** One page of results. */
export interface Page<T> {
	items: T[];
	page: number;
	/** The most items a page holds. */
	perPage: number;
	hasNextPage: boolean;
	/**
	 * Whether matching items were left out because they are still being
	 * prepared; asking again shortly includes them.
	 */
	isPreparing: boolean;
}

const sortOrders: Record<NonNullable<z.infer<typeof BrowseQuerySchema>["sort"]>, MediaSort[]> = {
	trending: ["TRENDING_DESC", "POPULARITY_DESC"],
	popular: ["POPULARITY_DESC"],
	score: ["SCORE_DESC", "POPULARITY_DESC"],
	newest: ["START_DATE_DESC", "POPULARITY_DESC"],
	title: ["TITLE_ROMAJI"],
};

/**
 * Searches and filters the catalog. Adult media is always excluded.
 *
 * @example
 * ```ts
 * const page = await browseAnime({ season: "FALL", seasonYear: 2026, sort: "popular" });
 * ```
 *
 * @throws {@link InvalidInputError} when the query fails {@link BrowseQuerySchema}.
 */
export async function browseAnime(query: BrowseQuery): Promise<Page<AnimeCard>> {
	const parsed = BrowseQuerySchema.safeParse(query);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid browse query", {
			cause: parsed.error,
		});
	}

	const input = parsed.data;
	const sort: MediaSort[] = input.sort
		? sortOrders[input.sort]
		: input.search
			? ["SEARCH_MATCH"]
			: sortOrders.trending;

	const { Page } = await anilist(
		BrowseAnimeDocument,
		{
			page: input.page,
			perPage: input.perPage,
			// Absent filters must be omitted, not null; see codegen.ts.
			search: input.search,
			sort,
			season: input.season,
			seasonYear: input.seasonYear,
			format: input.format,
			excludedFormats: [...excludedFormats],
			status: input.status,
			genres: input.genres,
		},
		{
			// Searches are rarely repeated exactly; lists like "trending" are shared.
			maxAgeMs: input.search ? 10 * minute : hour,
		},
	);

	return {
		items: (Page?.media ?? []).flatMap((media) => (media ? [toAnimeCard(media)] : [])),
		page: input.page,
		perPage: input.perPage,
		hasNextPage: Page?.pageInfo?.hasNextPage === true,
		isPreparing: false,
	};
}

/** Lists the genre names accepted by {@link browseAnime}. */
export async function getGenres(): Promise<string[]> {
	const { GenreCollection } = await anilist(
		GenresDocument,
		{},
		{
			maxAgeMs: 7 * day,
		},
	);

	// "Hentai" is only reachable through adult media, which is never served.
	return (GenreCollection ?? []).filter(
		(genre): genre is string => genre !== null && genre !== "Hentai",
	);
}

const seasonOrder = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;

/** The season `now` falls in: winter is January to March, and so on. Counted in UTC. */
export function currentSeason(now = new Date()): AnimeSeason {
	return {
		season: seasonOrder[Math.floor(now.getUTCMonth() / 3)]!,
		year: now.getUTCFullYear(),
	};
}

/** The season after `season`. */
export function nextSeason(season: AnimeSeason): AnimeSeason {
	return season.season === "FALL"
		? {
				season: "WINTER",
				year: season.year + 1,
			}
		: {
				season: seasonOrder[seasonOrder.indexOf(season.season) + 1]!,
				year: season.year,
			};
}

/**
 * Every season some anime started in, the latest first, up to the season
 * after `now`'s, whose titles are announced by then. Adult media is never
 * served, so seasons with only adult media are left out. Reads only the
 * search index.
 */
export async function listSeasons(now = new Date()): Promise<AnimeSeason[]> {
	const next = nextSeason(currentSeason(now));
	const position = (season: AnimeSeason) => season.year * 4 + seasonOrder.indexOf(season.season);

	const rows = await db
		.selectDistinct({
			season: animeSearch.season,
			year: animeSearch.seasonYear,
		})
		.from(animeSearch)
		.where(
			and(
				eq(animeSearch.isAdult, false),
				catalogFormatAllowed(animeSearch.format),
				isNotNull(animeSearch.season),
				isNotNull(animeSearch.seasonYear),
				lte(animeSearch.seasonYear, next.year),
			),
		);

	return rows
		.flatMap((row): AnimeSeason[] => {
			const season = seasonOrder.find((name) => name === row.season);
			return season && row.year !== null
				? [
						{
							season,
							year: row.year,
						},
					]
				: [];
		})
		.filter((season) => position(season) <= position(next))
		.toSorted((left, right) => position(right) - position(left));
}
