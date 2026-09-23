import { doublePrecision, index, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

import { jsonb, timestamptz } from "./columns";

export const tmdbMediaType = pgEnum("tmdb_media_type", [
  "tv",
  "movie"
]);

/**
 * Where one AniList entry lives on TMDB.
 *
 * A TV mapping lists, per AniList episode, the TMDB episode it corresponds
 * to. Every AniList entry mapped to the same TMDB show belongs to one series.
 *
 * A row with a null `tmdbId` records that no confident match exists, so the
 * search is not repeated on every request.
 */
export const tmdbMapping = pgTable(
  "tmdb_mapping",
  {
    anilistId: integer("anilist_id").primaryKey(),
    mediaType: tmdbMediaType("media_type"),
    tmdbId: integer("tmdb_id"),
    /** TMDB season of the entry's first mapped episode; `0` is TMDB's specials season. */
    seasonNumber: integer("season_number"),
    /** TMDB episode number of the entry's first mapped episode, for ordering entries within a show. */
    episodeNumber: integer("episode_number"),
    /** `EpisodeLink[]` for TV mappings, empty otherwise. */
    episodes: jsonb("episodes").$type<unknown>().notNull(),
    /** Which signal decided the match, for diagnosing bad mappings. */
    method: text("method"),
    score: doublePrecision("score"),
    resolvedAt: timestamptz("resolved_at").notNull()
  },
  (table) => [index("tmdb_mapping_target_idx").on(table.mediaType, table.tmdbId)]
);
