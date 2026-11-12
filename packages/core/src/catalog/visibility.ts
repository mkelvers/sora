import { sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";

import { anime } from "../database/schema/catalog";
import { series } from "../database/schema/series";

/** Short TV series stay out of catalogue discovery, but saved titles remain accessible.
 * ONA describes web distribution, including full-length shows such as Overgeared.
 */
export const excludedFormats = ["TV_SHORT"] as const;

export const isCatalogFormat = (format: string | null | undefined) =>
	!excludedFormats.some((excluded) => excluded === format);

/** Applies the catalog policy before ranking, pagination, or notification counts. */
export const catalogFormatAllowed = (format: SQLWrapper) =>
	sql`(${format} is null or ${format} not in (${sql.join(
		excludedFormats.map((excluded) => sql`${excluded}`),
		sql`, `,
	)}))`;

/**
 * Uses stored metadata, including for titles not yet mirrored in the search index.
 * Matches `anime_excluded_format_idx`, so it never reads the stored JSON; keep the
 * two lists of formats in step.
 */
export const catalogSeriesAllowed = sql`not exists (
	select 1 from ${anime}
	where ${anime.anilistId} = ${series.anilistId}
	and ${anime.format} in (${sql.join(
		excludedFormats.map((format) => sql`${format}`),
		sql`, `,
	)})
)`;

/**
 * How strongly a tag must apply, from 0 to 100 as AniList users voted, for
 * a title to be found by it. Below this, a tag names something the title
 * only touches on: a show with Isekai at 20 is not an isekai.
 */
export const tagMinimumRank = 60;

/** Genres that mark a title as mature. */
export const matureGenres = ["Ecchi"] as const;

/**
 * Tags that mark a title as mature where they apply at least
 * {@link matureTagRank}, besides those AniList keeps for adult media.
 */
export const matureTags = [
	"Body Horror",
	"Cannibalism",
	"Ero Guro",
	"Gore",
	"Nudity",
	"Torture",
] as const;

/** How strongly a {@link matureTags} tag must apply to mark a title as mature. */
export const matureTagRank = 50;
