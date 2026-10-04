import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";

import type {
	AnimeDetailsFragment,
	MediaFormat,
	MediaSeason,
	MediaStatus,
} from "../../anilist/graphql.generated";
import { jsonb, timestamptz } from "./columns";

/**
 * The last response AniList gave each request, keyed by operation and
 * variables, kept for good.
 *
 * Every read says how old a response it accepts (`maxAgeMs`), an hour at
 * most for anything that changes, so AniList's 30 to 90 requests a minute
 * are not spent on asking the same thing twice. An older response is served
 * only while AniList is down.
 */
export const anilistResponse = pgTable("anilist_response", {
	key: text("key").primaryKey(),
	operation: text("operation").notNull(),
	data: jsonb("data").$type<unknown>().notNull(),
	fetchedAt: timestamptz("fetched_at").notNull(),
});

/**
 * The last response TMDB gave each request, keyed by path and query, kept
 * for good.
 *
 * Every read says how old a response it accepts (`maxAgeMs`). Shows are the
 * source the scheduler lays series out from, and it asks TMDB for one again
 * only as `refreshEpisodeListings` decides, so a stored show may be months
 * old; an older response of any kind is served while TMDB is down.
 */
export const tmdbResponse = pgTable("tmdb_response", {
	key: text("key").primaryKey(),
	path: text("path").notNull(),
	data: jsonb("data").$type<unknown>().notNull(),
	fetchedAt: timestamptz("fetched_at").notNull(),
});

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
		 * from codegen-typed responses, so, like `anilist_response`, it is read
		 * back without re-validation.
		 */
		media: jsonb("media").$type<AnimeDetailsFragment>().notNull(),
		/** Copied from `media` so the scheduler can find anime that are still airing. */
		status: text("status").$type<MediaStatus>(),
		savedAt: timestamptz("saved_at").notNull().defaultNow(),
		refreshedAt: timestamptz("refreshed_at").notNull(),
	},
	(table) => [index("anime_status_idx").on(table.status)],
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
		/** How many AniList users have scored it; `null` when AniList has no score distribution for it. */
		scoreCount: integer("score_count"),
		isAdult: boolean("is_adult").notNull(),
		/** When AniList last changed the entry. */
		updatedAt: timestamptz("updated_at").notNull(),
	},
	(table) => [
		// Without a pending list: each sync updates thousands of rows, and a
		// pending list that long made the planner pass over the index and scan
		// the whole table on every search, until autovacuum next flushed it.
		index("anime_search_text_idx").using("gin", table.searchText.op("gin_trgm_ops")).with({
			fastupdate: false,
		}),
		index("anime_search_updated_at_idx").on(table.updatedAt),
	],
);

/**
 * When each mirrored catalogue last finished a full sync. A catalogue is
 * only relied on once one has: a partly filled one would miss titles.
 */
export const catalogSync = pgTable("catalog_sync", {
	catalog: text("catalog").primaryKey(),
	fullSyncAt: timestamptz("full_sync_at").notNull(),
});
