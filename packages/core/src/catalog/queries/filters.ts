import { eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { animeSearch, animeSearchTag } from "../../database/schema/catalog";
import {
	formatAllowed,
	matureGenres,
	matureTagRank,
	matureTags,
	tagMinimumRank,
} from "../visibility";
import type { BrowseQuery } from "./browse-query";

/** The browse filters, as conditions on the search index. */
export class Filters {
	readonly #filters: Omit<BrowseQuery, "search" | "page" | "perPage">;

	constructor(filters: Omit<BrowseQuery, "search" | "page" | "perPage">) {
		this.#filters = filters;
	}

	/**
	 * The index rows the filters allow. Adult and short TV entries are
	 * excluded. Music videos are returned only when `format` asks for them.
	 */
	get conditions() {
		const filters = this.#filters;
		const conditions: SQL[] = [eq(animeSearch.isAdult, false), formatAllowed(animeSearch.format)];

		if (filters.format) {
			conditions.push(inArray(animeSearch.format, filters.format));
		} else {
			// Music videos are not titles to watch; they are found only when asked for.
			conditions.push(sql`${animeSearch.format} is distinct from 'MUSIC'`);
		}

		if (filters.status) {
			conditions.push(eq(animeSearch.status, filters.status));
		}

		if (filters.season) {
			conditions.push(eq(animeSearch.season, filters.season));
		}

		if (filters.seasonYear) {
			conditions.push(eq(animeSearch.seasonYear, filters.seasonYear));
		}

		if (filters.genres?.length) {
			conditions.push(sql`${animeSearch.genres} @> ${JSON.stringify(filters.genres)}::text::jsonb`);
		}

		conditions.push(...this.#tags, ...this.#release);

		return conditions;
	}

	/** The conditions of the tag filters: those a title must carry, those it must not, and mature content. */
	get #tags() {
		const filters = this.#filters;
		const conditions: SQL[] = [];

		for (const tag of filters.tags ?? []) {
			conditions.push(
				sql`exists (select 1 from ${animeSearchTag} where ${animeSearchTag.anilistId} = ${animeSearch.anilistId} and ${animeSearchTag.tag} = ${tag} and ${animeSearchTag.rank} >= ${tagMinimumRank} and not ${animeSearchTag.spoiler})`,
			);
		}

		if (filters.excludedTags?.length) {
			conditions.push(
				sql`not exists (select 1 from ${animeSearchTag} where ${animeSearchTag.anilistId} = ${animeSearch.anilistId} and ${inArray(animeSearchTag.tag, filters.excludedTags)} and ${animeSearchTag.rank} >= ${tagMinimumRank})`,
			);
		}

		if (filters.hideMature) {
			conditions.push(
				...matureGenres.map(
					(genre) => sql`not ${animeSearch.genres} @> ${JSON.stringify([genre])}::text::jsonb`,
				),
				sql`not exists (select 1 from ${animeSearchTag} where ${animeSearchTag.anilistId} = ${animeSearch.anilistId} and ${animeSearchTag.rank} >= ${matureTagRank} and (${animeSearchTag.adult} or ${inArray(animeSearchTag.tag, [...matureTags])}))`,
			);
		}

		return conditions;
	}

	/** The conditions of the filters on how a title was made and released. */
	get #release() {
		const filters = this.#filters;
		const conditions: SQL[] = [];

		if (filters.studios?.length) {
			conditions.push(
				or(
					...filters.studios.map(
						(studio) => sql`${animeSearch.studios} @> ${JSON.stringify([studio])}::text::jsonb`,
					),
				) ?? sql`false`,
			);
		}

		if (filters.sources?.length) {
			conditions.push(
				or(
					inArray(animeSearch.source, filters.sources),
					inArray(animeSearch.originSource, filters.sources),
				) ?? sql`false`,
			);
		}

		if (filters.countries?.length) {
			conditions.push(
				or(
					inArray(animeSearch.country, filters.countries),
					inArray(animeSearch.originCountry, filters.countries),
				) ?? sql`false`,
			);
		}

		const released = sql`coalesce(${animeSearch.seasonYear}, left(${animeSearch.startDate}, 4)::integer)`;

		if (filters.yearFrom) {
			conditions.push(sql`${released} >= ${filters.yearFrom}`);
		}

		if (filters.yearTo) {
			conditions.push(sql`${released} <= ${filters.yearTo}`);
		}

		if (filters.minEpisodes) {
			conditions.push(gte(animeSearch.episodes, filters.minEpisodes));
		}

		if (filters.maxEpisodes) {
			conditions.push(lte(animeSearch.episodes, filters.maxEpisodes));
		}

		if (filters.minScore !== undefined) {
			conditions.push(gte(animeSearch.averageScore, filters.minScore));
		}

		return conditions;
	}
}
