import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/client";
import { tmdbHint, tmdbMapping } from "../database/schema/series";
import type { EpisodeLink } from "./matching";

/** A stored AniList-to-TMDB mapping; `tmdbId` is `null` when no match was found. */
export type TmdbMapping = typeof tmdbMapping.$inferSelect;

/**
 * The episode links of a TV mapping, validated because they come from a
 * JSON column. A malformed value reads as no links.
 */
export const mappedEpisodes = (mapping: TmdbMapping): EpisodeLink[] => {
	const EpisodeLinksSchema = z.array(
		z.object({
			anilistEpisode: z.number().int(),
			episodeNumber: z.number().int(),
			seasonNumber: z.number().int(),
		}),
	);

	const parsed = EpisodeLinksSchema.safeParse(mapping.episodes);

	if (parsed.success) {
		return parsed.data;
	}

	return [];
};

/**
 * Marks the stored mappings of `anilistIds` to be matched again, as when
 * their TMDB hints changed. A mapping already at one of its entry's hinted
 * titles is kept, since a hint cannot move it elsewhere.
 *
 * @returns The entries whose mappings were marked.
 */
export const expireMappingsAgainstHints = async (
	anilistIds: readonly number[],
): Promise<number[]> => {
	if (anilistIds.length === 0) {
		return [];
	}

	const expired = await db
		.update(tmdbMapping)
		.set({
			resolvedAt: new Date(0),
		})
		.where(
			and(
				inArray(tmdbMapping.anilistId, [...anilistIds]),
				sql`not exists (
          select 1 from ${tmdbHint}
          where ${tmdbHint.anilistId} = ${tmdbMapping.anilistId}
            and (
              (${tmdbMapping.mediaType} = 'tv' and ${tmdbHint.showId} = ${tmdbMapping.tmdbId})
              or (${tmdbMapping.mediaType} = 'movie' and ${tmdbMapping.tmdbId} = any(${tmdbHint.movieIds}))
            )
        )`,
			),
		)
		.returning({
			anilistId: tmdbMapping.anilistId,
		});

	return expired.map((row) => row.anilistId);
};

/**
 * Marks an entry's stored mapping to be matched again on its next layout,
 * as when TMDB may have started to list an entry it did not match.
 */
export const expireMapping = async (anilistId: number) => {
	await db
		.update(tmdbMapping)
		.set({
			resolvedAt: new Date(0),
		})
		.where(eq(tmdbMapping.anilistId, anilistId));
};
