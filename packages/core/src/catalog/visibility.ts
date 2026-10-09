import { sql, type SQLWrapper } from "drizzle-orm";

import { anime, series } from "../database/schema";

/** Short TV series stay out of catalogue discovery, but saved titles remain accessible.
 * ONA describes web distribution, including full-length shows such as Overgeared.
 */
export const excludedFormats = ["TV_SHORT"] as const;

export function isCatalogFormat(format: string | null | undefined) {
	return !excludedFormats.some((excluded) => excluded === format);
}

/** Applies the catalog policy before ranking, pagination, or notification counts. */
export function catalogFormatAllowed(format: SQLWrapper) {
	return sql`(${format} is null or ${format} not in (${sql.join(
		excludedFormats.map((format) => sql`${format}`),
		sql`, `,
	)}))`;
}

/** Uses stored metadata, including for titles not yet mirrored in the search index. */
export const catalogSeriesAllowed = sql`not exists (
	select 1 from ${anime}
	where ${anime.anilistId} = ${series.anilistId}
	and not (${catalogFormatAllowed(sql`${anime.media}->>'format'`)})
)`;
