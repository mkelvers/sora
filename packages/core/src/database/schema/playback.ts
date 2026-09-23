import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { jsonb, timestamptz } from "./columns";

/**
 * The result of matching an AniList anime to a stream provider's catalogue.
 *
 * A row with a null `providerMediaId` records that no confident match exists,
 * so the expensive fuzzy search is not repeated on every request.
 */
export const providerMapping = pgTable(
  "provider_mapping",
  {
    anilistId: integer("anilist_id").notNull(),
    provider: text("provider").notNull(),
    providerMediaId: text("provider_media_id"),
    matchedTitle: text("matched_title"),
    method: text("method"),
    resolvedAt: timestamptz("resolved_at").notNull()
  },
  (table) => [
    primaryKey({
      columns: [
        table.anilistId,
        table.provider
      ]
    })
  ]
);

/**
 * A provider's episode list for one anime, stored permanently.
 *
 * Only the airing scheduler refreshes a stored list, while the anime is still
 * airing. Stream URLs expire and are never stored here.
 */
export const providerEpisodes = pgTable(
  "provider_episodes",
  {
    anilistId: integer("anilist_id").notNull(),
    provider: text("provider").notNull(),
    units: jsonb("units").$type<unknown>().notNull(),
    fetchedAt: timestamptz("fetched_at").notNull()
  },
  (table) => [
    primaryKey({
      columns: [
        table.anilistId,
        table.provider
      ]
    })
  ]
);
