import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import type {
	AnimeDetailsFragment,
	MediaFormat,
	MediaSeason,
	MediaSource,
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
	data: jsonb("data").$type<unknown>().notNull(),
	fetchedAt: timestamptz("fetched_at").notNull(),
	key: text("key").primaryKey(),
	operation: text("operation").notNull(),
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
	data: jsonb("data").$type<unknown>().notNull(),
	fetchedAt: timestamptz("fetched_at").notNull(),
	key: text("key").primaryKey(),
	path: text("path").notNull(),
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
		/** Generated from `media`, so catalogue visibility never has to read the JSON. */
		format: text("format").generatedAlwaysAs(sql`media->>'format'`),
		/**
		 * The `AnimeDetails` fragment exactly as AniList returned it. Written only
		 * from codegen-typed responses, so, like `anilist_response`, it is read
		 * back without re-validation.
		 */
		media: jsonb("media").$type<AnimeDetailsFragment>().notNull(),
		refreshedAt: timestamptz("refreshed_at").notNull(),
		savedAt: timestamptz("saved_at").notNull().defaultNow(),
		/** Copied from `media` so the scheduler can find anime that are still airing. */
		status: text("status").$type<MediaStatus>(),
	},
	(table) => [
		index("anime_status_idx").on(table.status),
		index("anime_excluded_format_idx")
			.on(table.anilistId)
			.where(sql`${table.format} in ('TV_SHORT')`),
	],
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
		averageScore: integer("average_score"),
		/** Country of origin as an ISO 3166-1 alpha-2 code, such as `JP`. */
		country: text("country"),
		/** Minutes per episode. */
		duration: integer("duration"),
		english: text("english"),
		/** How many episodes it has, or will have when that is known. */
		episodes: integer("episodes"),
		format: text("format").$type<MediaFormat>(),
		genres: jsonb("genres").$type<string[]>().notNull(),
		isAdult: boolean("is_adult").notNull(),
		native: text("native"),
		popularity: integer("popularity").notNull(),
		romaji: text("romaji"),
		/** How many AniList users have scored it; `null` when AniList has no score distribution for it. */
		scoreCount: integer("score_count"),
		/**
		 * How many AniList users scored it with each star, from one star to five:
		 * AniList's ten score buckets in pairs. `null` when AniList has no score
		 * distribution for it.
		 */
		scoreStars: jsonb("score_stars").$type<number[]>(),
		/**
		 * Every title, lowercased with punctuation and accents removed, along
		 * with its initials, such as `aot` for Attack on Titan. Candidates are
		 * found by trigram similarity to it, which forgives typos.
		 */
		searchText: text("search_text").notNull(),
		season: text("season").$type<MediaSeason>(),
		seasonYear: integer("season_year"),
		/** What it adapts, such as `MANGA` or `ORIGINAL`. */
		source: text("source").$type<MediaSource>(),
		/** `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, depending on what is known. */
		startDate: text("start_date"),
		status: text("status").$type<MediaStatus>(),
		/** The studios AniList credits as its main ones, by name. */
		studios: jsonb("studios").$type<string[]>().notNull().default([]),
		synonyms: jsonb("synonyms").$type<string[]>().notNull(),
		trending: integer("trending").notNull(),
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
 * AniList's tags on each entry of {@link animeSearch}, such as Isekai or
 * Seinen, with how strongly each applies, so browsing can filter by them.
 * Every tag is kept, however weakly it applies; browsing decides how strong
 * a tag must be to count.
 */
export const animeSearchTag = pgTable(
	"anime_search_tag",
	{
		/** Whether AniList keeps the tag for adult media; such a tag on another entry marks sexual content. */
		adult: boolean("adult").notNull(),
		anilistId: integer("anilist_id")
			.notNull()
			.references(() => animeSearch.anilistId, {
				onDelete: "cascade",
			}),
		/** How strongly the tag applies, from 0 to 100, as AniList users voted. */
		rank: integer("rank").notNull(),
		/** Whether the tag gives away something about this entry's story. */
		spoiler: boolean("spoiler").notNull(),
		tag: text("tag").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.anilistId, table.tag],
		}),
		index("anime_search_tag_tag_idx").on(table.tag, table.rank),
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
