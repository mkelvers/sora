import { index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

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
    /**
     * Episodes of the provider's series that belong to earlier parts, for a
     * part the provider files under its prequel: the anime's first episode
     * is the provider's episode `episodeOffset + 1`.
     */
    episodeOffset: integer("episode_offset").notNull().default(0),
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

/**
 * AniKoto's catalogue, mirrored so an anime can be matched to its AniKoto
 * series by ID instead of by title. AniKoto records the AniList ID of about
 * half its series and the MyAnimeList ID of nearly all of them.
 *
 * The scheduler keeps it current; see `syncAniKotoCatalog`.
 */
export const anikotoSeries = pgTable(
  "anikoto_series",
  {
    anikotoId: integer("anikoto_id").primaryKey(),
    anilistId: integer("anilist_id"),
    malId: integer("mal_id"),
    title: text("title").notNull(),
    /** Every title AniKoto lists: English, romaji, native, and alternatives. */
    titles: jsonb("titles").$type<string[]>().notNull(),
    /** The AniList format AniKoto's type corresponds to, such as `TV` or `MOVIE`. */
    format: text("format"),
    year: integer("year"),
    episodes: integer("episodes"),
    /** When AniKoto last changed the series; its catalogue is ordered by it. */
    updatedAt: timestamptz("updated_at").notNull()
  },
  (table) => [
    index("anikoto_series_anilist_id_idx").on(table.anilistId),
    index("anikoto_series_mal_id_idx").on(table.malId)
  ]
);
