import {
	bigint,
	boolean,
	doublePrecision,
	index,
	integer,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";

import type { TimelineShift } from "../../playback/streams/align";
import type { CueAnchor } from "../../playback/subtitles/refine";
import { jsonb, timestamptz } from "./columns";
import { series } from "./series";

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
		/**
		 * Episodes of the provider's series that belong to earlier parts, for a
		 * part the provider files under its prequel: the anime's first episode
		 * is the provider's episode `episodeOffset + 1`.
		 */
		episodeOffset: integer("episode_offset").notNull().default(0),
		matchedTitle: text("matched_title"),
		method: text("method"),
		provider: text("provider").notNull(),
		providerMediaId: text("provider_media_id"),
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
		fetchedAt: timestamptz("fetched_at").notNull(),
		provider: text("provider").notNull(),
		units: jsonb("units").$type<unknown>().notNull(),
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
		episodes: integer("episodes"),
		/** The AniList format AniKoto's type corresponds to, such as `TV` or `MOVIE`. */
		format: text("format"),
		malId: integer("mal_id"),
		title: text("title").notNull(),
		/** Every title AniKoto lists: English, romaji, native, and alternatives. */
		titles: jsonb("titles").$type<string[]>().notNull(),
		/** When AniKoto last changed the series; its catalogue is ordered by it. */
		updatedAt: timestamptz("updated_at").notNull(),
		year: integer("year"),
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
		/** Time spent in every call of the hour, for average latency. */
		durationMs: bigint("duration_ms", {
			mode: "number",
		})
			.notNull()
			.default(0),
		empty: integer("empty").notNull().default(0),
		failed: integer("failed").notNull().default(0),
		/** Start of the hour the calls began in. */
		hour: timestamptz("hour").notNull(),
		lastError: text("last_error"),
		lastErrorAt: timestamptz("last_error_at"),
		ok: integer("ok").notNull().default(0),
		/** The provider interface method, such as `resolve_stream`. */
		operation: text("operation").notNull(),
		provider: text("provider").notNull(),
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
	anilistId: integer("anilist_id"),
	resolvedAt: timestamptz("resolved_at").notNull(),
	/** The show's path on AnimeSchedule, such as `yomi-no-tsugai`. */
	route: text("route").primaryKey(),
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
		airType: text("air_type").$type<AirType>().notNull(),
		airsAt: timestamptz("airs_at").notNull(),
		/** Whether AnimeSchedule files the show as a donghua, a Chinese animation. */
		donghua: boolean("donghua").notNull().default(false),
		episode: integer("episode").notNull(),
		/** How long an episode runs, in minutes, as AnimeSchedule gives it; null when unknown. */
		lengthMinutes: integer("length_minutes"),
		route: text("route").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.route, table.airType, table.episode],
		}),
		index("anime_schedule_release_airs_at_idx").on(table.airsAt),
	],
);

/**
 * How a sub's English subtitles move onto one dub's timeline so each cue
 * shows while the dub says it, found by matching the cues to the speech in
 * the dub's audio; see `refineCues`. Keyed by what identifies the pair of
 * encodes, since stream URLs expire but their paths do not.
 *
 * A row with null `shifts` records that the dub's speech does not match
 * the sub's script, so it is not tried again until `attemptedAt` is a week
 * old.
 */
export const subtitleRefinement = pgTable("subtitle_refinement", {
	/** Where each matched cue goes; see `CueAnchor`. */
	anchors: jsonb("anchors").$type<CueAnchor[] | null>(),
	attemptedAt: timestamptz("attempted_at").notNull(),
	/** A hash of the dub's and the sub's playlist paths. */
	key: text("key").primaryKey(),
	/** How the sub's timeline maps onto the dub's for cues without an anchor. */
	shifts: jsonb("shifts").$type<TimelineShift[] | null>(),
});

/**
 * How long each episode's opening and ending ran as its provider reported
 * them, per audio. A series' episodes share their opening's length, so the
 * length most of them report is the one an outlier is brought to; see
 * `normalizeSkipSegments`.
 */
export const skipSegmentLength = pgTable(
	"skip_segment_length",
	{
		audio: text("audio").notNull(),
		episode: integer("episode").notNull(),
		kind: text("kind").notNull(),
		seconds: doublePrecision("seconds").notNull(),
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
	},
	(table) => [
		primaryKey({
			columns: [table.seriesId, table.audio, table.kind, table.episode],
		}),
	],
);
