import { sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";

import { anime, series } from "../database/schema";

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
