import { z } from "zod";

import { FormatSchema, SourceSchema, StatusSchema } from "../../models/series";

const year = z.number().int().min(1940).max(2100);

/** Browse filters accepted from clients. Validate untrusted input with this schema. */
export const BrowseQuerySchema = z.object({
	/**
	 * Only titles that can be watched with this audio. Applied to the titles
	 * found, after AniList pages them, so a page can hold fewer cards than
	 * `perPage`; titles still being prepared are left out.
	 */
	audio: z.enum(["sub", "dub"]).optional(),
	/** Only titles made in one of these countries, by ISO 3166-1 alpha-2 code. */
	countries: z
		.array(z.string().regex(/^[A-Z]{2}$/u))
		.max(10)
		.optional(),
	/** Leave out titles carrying any of these tags. */
	excludedTags: z.array(z.string().min(1)).max(10).optional(),
	format: z.array(FormatSchema).optional(),
	genres: z.array(z.string().min(1)).max(10).optional(),
	/**
	 * Leave out titles with sexual content, nudity, or gore: the Ecchi genre,
	 * and the tags that mark them where they apply strongly.
	 */
	hideMature: z.boolean().optional(),
	/** Only titles with at most this many episodes. */
	maxEpisodes: z.number().int().positive().optional(),
	/** Only titles with at least this many episodes. */
	minEpisodes: z.number().int().positive().optional(),
	/** Only titles AniList users score at least this high, from 0 to 100. */
	minScore: z.number().int().min(0).max(100).optional(),
	page: z.number().int().positive().max(500).default(1),
	perPage: z.number().int().positive().max(50).default(24),
	/** Free-text search. When present, results are ordered by relevance unless `sort` is set. */
	search: z.string().trim().min(1).max(200).optional(),
	season: z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]).optional(),
	seasonYear: year.optional(),
	sort: z.enum(["trending", "popular", "score", "newest", "title"]).optional(),
	/** Only titles adapting one of these. */
	sources: z.array(SourceSchema).max(15).optional(),
	status: StatusSchema.optional(),
	/** Only titles a main studio of which is one of these, by name. */
	studios: z.array(z.string().min(1)).max(10).optional(),
	/**
	 * Only titles carrying every one of these tags, such as Isekai or Seinen,
	 * where the tag applies strongly and does not spoil the story.
	 */
	tags: z.array(z.string().min(1)).max(10).optional(),
	/** Only titles first released in this year or later. */
	yearFrom: year.optional(),
	/** Only titles first released in this year or earlier. */
	yearTo: year.optional(),
});

export type BrowseQuery = z.input<typeof BrowseQuerySchema>;
