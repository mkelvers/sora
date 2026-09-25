import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";

import type { AnimeDetailsFragment, MediaFormat, MediaSeason, MediaStatus } from "../../anilist/graphql.generated";
import { jsonb, timestamptz } from "./columns";

/** Cached AniList GraphQL responses keyed by operation and variables. */
export const anilistSnapshot = pgTable(
  "anilist_snapshot",
  {
    key: text("key").primaryKey(),
    operation: text("operation").notNull(),
    data: jsonb("data").$type<unknown>().notNull(),
    fetchedAt: timestamptz("fetched_at").notNull(),
    expiresAt: timestamptz("expires_at").notNull()
  },
  (table) => [index("anilist_snapshot_expires_idx").on(table.expiresAt)]
);

/** Cached TMDB REST responses keyed by path and query. */
export const tmdbSnapshot = pgTable(
  "tmdb_snapshot",
  {
    key: text("key").primaryKey(),
    path: text("path").notNull(),
    data: jsonb("data").$type<unknown>().notNull(),
    fetchedAt: timestamptz("fetched_at").notNull(),
    expiresAt: timestamptz("expires_at").notNull()
  },
  (table) => [index("tmdb_snapshot_expires_idx").on(table.expiresAt)]
);

/**
 * Every anime the catalog has served, stored permanently.
 *
 * An anime is fetched from AniList the first time it is opened and never
 * again once it has finished airing. Airing and upcoming anime are refreshed
 * only by the airing scheduler, which stops once the final episode is out.
 */
export const anime = pgTable(
  "anime",
  {
    anilistId: integer("anilist_id").primaryKey(),
    /**
     * The `AnimeDetails` fragment exactly as AniList returned it. Written only
     * from codegen-typed responses, so, like `anilist_snapshot`, it is read
     * back without re-validation.
     */
    media: jsonb("media").$type<AnimeDetailsFragment>().notNull(),
    /** Copied from `media` so the scheduler can find anime that are still airing. */
    status: text("status").$type<MediaStatus>(),
    savedAt: timestamptz("saved_at").notNull().defaultNow(),
    refreshedAt: timestamptz("refreshed_at").notNull()
  },
  (table) => [index("anime_status_idx").on(table.status)]
);

/**
 * Every anime on AniList, with what searching needs, so a search is answered
 * from the database rather than from AniList, which allows only 30 to 90
 * requests a minute for the whole server.
 *
 * The scheduler keeps it current; see `syncSearchIndex`.
 */
export const animeSearch = pgTable(
  "anime_search",
  {
    anilistId: integer("anilist_id").primaryKey(),
    english: text("english"),
    romaji: text("romaji"),
    native: text("native"),
    synonyms: jsonb("synonyms").$type<string[]>().notNull(),
    /**
     * Every title, lowercased with punctuation and accents removed, along
     * with its initials, such as `aot` for Attack on Titan. Candidates are
     * found by trigram similarity to it, which forgives typos.
     */
    searchText: text("search_text").notNull(),
    format: text("format").$type<MediaFormat>(),
    status: text("status").$type<MediaStatus>(),
    season: text("season").$type<MediaSeason>(),
    seasonYear: integer("season_year"),
    /** `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, depending on what is known. */
    startDate: text("start_date"),
    genres: jsonb("genres").$type<string[]>().notNull(),
    popularity: integer("popularity").notNull(),
    trending: integer("trending").notNull(),
    averageScore: integer("average_score"),
    isAdult: boolean("is_adult").notNull(),
    /** When AniList last changed the entry. */
    updatedAt: timestamptz("updated_at").notNull()
  },
  (table) => [
    index("anime_search_text_idx").using("gin", table.searchText.op("gin_trgm_ops")),
    index("anime_search_updated_at_idx").on(table.updatedAt)
  ]
);

/**
 * When each mirrored catalogue last finished a full sync. A catalogue is
 * only relied on once one has: a partly filled one would miss titles.
 */
export const catalogSync = pgTable("catalog_sync", {
  catalog: text("catalog").primaryKey(),
  fullSyncAt: timestamptz("full_sync_at").notNull()
});
