import { index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

import type { AnimeDetailsFragment, MediaStatus } from "../../anilist/graphql.generated";
import { timestamptz } from "./columns";

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
