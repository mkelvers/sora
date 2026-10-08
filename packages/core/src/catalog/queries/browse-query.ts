import { z } from "zod";

import { FormatSchema, StatusSchema } from "../../models/series";

/** Browse filters accepted from clients. Validate untrusted input with this schema. */
export const BrowseQuerySchema = z.object({
	/** Free-text search. When present, results are ordered by relevance unless `sort` is set. */
	search: z.string().trim().min(1).max(200).optional(),
	sort: z.enum(["trending", "popular", "score", "newest", "title"]).optional(),
	season: z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]).optional(),
	seasonYear: z.number().int().min(1940).max(2100).optional(),
	format: z.array(FormatSchema).optional(),
	status: StatusSchema.optional(),
	genres: z.array(z.string().min(1)).max(10).optional(),
	/**
	 * Only titles that can be watched with this audio. Applied to the titles
	 * found, after AniList pages them, so a page can hold fewer cards than
	 * `perPage`; titles still being prepared are left out.
	 */
	audio: z.enum(["sub", "dub"]).optional(),
	page: z.number().int().positive().max(500).default(1),
	perPage: z.number().int().positive().max(50).default(24),
});

export type BrowseQuery = z.input<typeof BrowseQuerySchema>;
