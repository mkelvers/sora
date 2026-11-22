import { day, hour, minute, defined } from "@sora/shared";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import type { z } from "zod";

import { anilist } from "../../anilist/client";
import { BrowseAnimeDocument, GenresDocument } from "../../anilist/graphql.generated";
import type { MediaSort } from "../../anilist/graphql.generated";
import { zBrowseAnimeQuery, zGenresQuery } from "../../anilist/validation.generated";
import { db } from "../../database/client";
import { animeSearch } from "../../database/schema/catalog";
import { InvalidInputError } from "../../errors";
import type { AnimeSeason } from "../../models/series";
import { toCard } from "../models/anime";
import type { AnimeCard } from "../models/anime";
import { formatAllowed, excludedFormats } from "../visibility";
import { BrowseQuerySchema } from "./browse-query";
import type { BrowseQuery } from "./browse-query";

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
	newest: ["START_DATE_DESC", "POPULARITY_DESC"],
	popular: ["POPULARITY_DESC"],
	score: ["SCORE_DESC", "POPULARITY_DESC"],
	title: ["TITLE_ROMAJI"],
	trending: ["TRENDING_DESC", "POPULARITY_DESC"],
};

/**
 * Searches and filters the catalog. Adult media is always excluded.
 *
 * @example
 * ```ts
 * const page = await browse({ season: "FALL", seasonYear: 2026, sort: "popular" });
 * ```
 *
 * @throws {InvalidInputError} when the query fails {@link BrowseQuerySchema}.
 */
export const browse = async (query: BrowseQuery): Promise<Page<AnimeCard>> => {
	const parsed = BrowseQuerySchema.safeParse(query);

	if (!parsed.success) {
		throw new InvalidInputError("Invalid browse query", {
			cause: parsed.error,
		});
	}

	const input = parsed.data;
	let sort: MediaSort[] = sortOrders.trending;

	if (input.sort) {
		sort = sortOrders[input.sort];
	} else if (input.search) {
		sort = ["SEARCH_MATCH"];
	}

	// Searches are rarely repeated exactly; lists like "trending" are shared.
	let maxAgeMs = hour;

	if (input.search) {
		maxAgeMs = 10 * minute;
	}

	const { Page } = await anilist(
		BrowseAnimeDocument,
		{
			excludedFormats: [...excludedFormats],
			format: input.format,
			genres: input.genres,
			page: input.page,
			perPage: input.perPage,
			// Absent filters must be omitted, not null; see codegen.ts.
			search: input.search,
			season: input.season,
			seasonYear: input.seasonYear,
			sort,
			status: input.status,
		},
		zBrowseAnimeQuery,
		{
			maxAgeMs,
		},
	);

	return {
		hasNextPage: Page?.pageInfo?.hasNextPage === true,
		isPreparing: false,
		items: (Page?.media ?? []).flatMap((media) => {
			if (media) {
				return [toCard(media)];
			}

			return [];
		}),
		page: input.page,
		perPage: input.perPage,
	};
};

/** Lists the genre names accepted by {@link browse}. */
export const getGenres = async (): Promise<string[]> => {
	const { GenreCollection } = await anilist(GenresDocument, {}, zGenresQuery, {
		maxAgeMs: 7 * day,
	});

	// "Hentai" is only reachable through adult media, which is never served.
	return (GenreCollection ?? []).filter(
		(genre): genre is string => genre !== null && genre !== "Hentai",
	);
};

const seasonOrder = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;

/** The season `now` falls in: winter is January to March, and so on. Counted in UTC. */
export const currentSeason = (now = new Date()): AnimeSeason => ({
	season: defined(seasonOrder[Math.floor(now.getUTCMonth() / 3)]),
	year: now.getUTCFullYear(),
});

/** The season after `season`. */
export const nextSeason = (season: AnimeSeason): AnimeSeason => {
	if (season.season === "FALL") {
		return {
			season: "WINTER",
			year: season.year + 1,
		};
	}

	return {
		season: defined(seasonOrder[seasonOrder.indexOf(season.season) + 1]),
		year: season.year,
	};
};

/**
 * Every season some anime started in, the latest first, up to the season
 * after `now`'s, whose titles are announced by then. Adult media is never
 * served, so seasons with only adult media are left out. Reads only the
 * search index.
 */
export const listSeasons = async (now = new Date()): Promise<AnimeSeason[]> => {
	const next = nextSeason(currentSeason(now));
	const last = next.year * 4 + seasonOrder.indexOf(next.season);

	const rows = await db
		.selectDistinct({
			season: animeSearch.season,
			year: animeSearch.seasonYear,
		})
		.from(animeSearch)
		.where(
			and(
				eq(animeSearch.isAdult, false),
				formatAllowed(animeSearch.format),
				isNotNull(animeSearch.season),
				isNotNull(animeSearch.seasonYear),
				lte(animeSearch.seasonYear, next.year),
			),
		);

	return rows
		.flatMap((row): AnimeSeason[] => {
			const season = seasonOrder.find((name) => name === row.season);

			if (season && row.year !== null) {
				return [
					{
						season,
						year: row.year,
					},
				];
			}

			return [];
		})
		.filter((season) => season.year * 4 + seasonOrder.indexOf(season.season) <= last)
		.toSorted(
			(left, right) =>
				right.year - left.year ||
				seasonOrder.indexOf(right.season) - seasonOrder.indexOf(left.season),
		);
};
