import { bigint, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

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
		resolvedAt: timestamptz("resolved_at").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.anilistId, table.provider],
		}),
	],
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
		fetchedAt: timestamptz("fetched_at").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.anilistId, table.provider],
		}),
	],
);

/**
 * The episodes AniKoto streams dubbed in English, by AniList entry and
 * episode, and when each dub came out. AniKoto says only which episodes are
 * dubbed, and no schedule covers every dub, so the moment a dub is first
 * seen on an episode AniKoto already carried is recorded as it happens; see
 * `refreshProviderUnits`.
 *
 * Every dubbed episode has a row, so a dub AniKoto's list drops for a while
 * is not taken for a new one when it is back.
 */
export const episodeDub = pgTable(
	"episode_dub",
	{
		anilistId: integer("anilist_id").notNull(),
		/** The episode as its AniList entry numbers it. */
		episode: integer("episode").notNull(),
		/**
		 * When the dub came out, or `null` for one nobody saw come out: AniKoto
		 * carried it when its list was first stored, or added it together with
		 * the episode.
		 */
		releasedAt: timestamptz("released_at"),
	},
	(table) => [
		primaryKey({
			columns: [table.anilistId, table.episode],
		}),
		index("episode_dub_released_at_idx").on(table.releasedAt),
	],
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
		updatedAt: timestamptz("updated_at").notNull(),
	},
	(table) => [
		index("anikoto_series_anilist_id_idx").on(table.anilistId),
		index("anikoto_series_mal_id_idx").on(table.malId),
	],
);

/**
 * How each provider's calls went, per operation and hour. Every call through
 * the provider interface is counted, including the ones playback falls
 * through silently, so a provider that stops working shows up here.
 *
 * `empty` counts calls that returned nothing without failing: no match, or
 * no episodes. A scraper whose site changed often returns nothing rather
 * than throwing, so a jump in `empty` is as telling as one in `failed`.
 *
 * Rows older than a month are pruned by the scheduler.
 */
export const providerCalls = pgTable(
	"provider_calls",
	{
		provider: text("provider").notNull(),
		/** The provider interface method, such as `resolve_stream`. */
		operation: text("operation").notNull(),
		/** Start of the hour the calls began in. */
		hour: timestamptz("hour").notNull(),
		ok: integer("ok").notNull().default(0),
		empty: integer("empty").notNull().default(0),
		failed: integer("failed").notNull().default(0),
		/** Time spent in every call of the hour, for average latency. */
		durationMs: bigint("duration_ms", {
			mode: "number",
		})
			.notNull()
			.default(0),
		lastError: text("last_error"),
		lastErrorAt: timestamptz("last_error_at"),
	},
	(table) => [
		primaryKey({
			columns: [table.provider, table.operation, table.hour],
		}),
		index("provider_calls_hour_idx").on(table.hour),
	],
);

/**
 * Which AniList entry each AnimeSchedule show is, as AnimeSchedule links
 * it, so its episodes can be placed in the release calendar and its dubs
 * looked for on AniKoto as they come out. `null` when it links no AniList
 * entry; such a show is looked up again after a week.
 *
 * The scheduler fills it in as shows appear in AnimeSchedule's timetable;
 * see `syncTimetables`.
 */
export const animeScheduleShow = pgTable("anime_schedule_show", {
	/** The show's path on AnimeSchedule, such as `yomi-no-tsugai`. */
	route: text("route").primaryKey(),
	anilistId: integer("anilist_id"),
	resolvedAt: timestamptz("resolved_at").notNull(),
});

/** How an episode in AnimeSchedule's timetable comes out. */
export type AirType = "raw" | "sub" | "dub";

/**
 * AnimeSchedule's timetable: when each episode of a show airs in Japan
 * (`raw`), streams with English subtitles (`sub`), and comes out dubbed in
 * English (`dub`). Episodes are numbered as the show's AniList entry
 * numbers them; see {@link animeScheduleShow} for the entry.
 *
 * The scheduler keeps last week to next week as AnimeSchedule lists them,
 * leaving out delayed episodes; see `syncTimetables`. Earlier weeks stay as
 * they were last listed.
 */
export const animeScheduleRelease = pgTable(
	"anime_schedule_release",
	{
		route: text("route").notNull(),
		airType: text("air_type").$type<AirType>().notNull(),
		episode: integer("episode").notNull(),
		airsAt: timestamptz("airs_at").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.route, table.airType, table.episode],
		}),
		index("anime_schedule_release_airs_at_idx").on(table.airsAt),
	],
);
