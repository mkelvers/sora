import {
	boolean,
	doublePrecision,
	index,
	integer,
	pgEnum,
	pgTable,
	primaryKey,
	text,
} from "drizzle-orm/pg-core";

import { jsonb, timestamptz } from "./columns";
import { series } from "./series";

/**
 * Where a user is with a whole series: `planning`, `watching`, or
 * `completed`, which follow their progress (see `settleStatus`), or
 * `dropped`, which only they set. It is stored, since a series stays
 * `completed` when a season comes out after. How far they are is read
 * from {@link playbackProgress}.
 */
export const libraryStatus = pgEnum("library_status", [
	"planning",
	"watching",
	"completed",
	"dropped",
]);

/**
 * One series in one user's library, with its status. How far
 * they are through it is not stored here but read from their progress, so
 * it stays true as the series gains seasons.
 *
 * Entries follow their series: when two stored series are merged, the
 * series store moves the entries of the one that disappears.
 */
export const libraryEntry = pgTable(
	"library_entry",
	{
		userId: text("user_id").notNull(),
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
		status: libraryStatus("status").notNull(),
		createdAt: timestamptz("created_at").notNull().defaultNow(),
		/** When the status last changed. */
		updatedAt: timestamptz("updated_at").notNull().defaultNow(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.seriesId],
		}),
		index("library_entry_user_updated_idx").on(table.userId, table.updatedAt),
	],
);

/**
 * One entry of a watchlist a user imported, keyed by AniList entry, until
 * it is applied: at once when its series is stored, or else when the
 * series is, which removes the row. See `importArcWatchlist`.
 */
export const libraryImport = pgTable(
	"library_import",
	{
		userId: text("user_id").notNull(),
		anilistId: integer("anilist_id").notNull(),
		/** What the watchlist said; `completed` marks the entry's episodes watched. */
		status: libraryStatus("status").notNull(),
		addedAt: timestamptz("added_at").notNull(),
		/** When the entry last changed in the watchlist, such as when it was completed. */
		updatedAt: timestamptz("updated_at").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.anilistId],
		}),
		index("library_import_anilist_idx").on(table.anilistId),
	],
);

/**
 * A title the user removed from "continue watching". It stays hidden until
 * they play it again; it says nothing about whether they will.
 *
 * Follows its series through merges like {@link libraryEntry}.
 */
export const continueWatchingDismissal = pgTable(
	"continue_watching_dismissal",
	{
		userId: text("user_id").notNull(),
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
		dismissedAt: timestamptz("dismissed_at").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.seriesId],
		}),
	],
);

/**
 * A title featured on one user's home page for one rotation (see
 * `rotationOf`), in `position` order. Kept for the rotation before as well,
 * so the next never features the same titles again.
 */
export const featuredPick = pgTable(
	"featured_pick",
	{
		userId: text("user_id").notNull(),
		rotation: integer("rotation").notNull(),
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
		position: integer("position").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.rotation, table.seriesId],
		}),
	],
);

/**
 * A title recommended to one user for one rotation (see `rotationOf`), in
 * `position` order, best fit first. Worked out on the first visit of the
 * rotation and kept for it, so the home page does not rank taste on every
 * load.
 */
export const recommendationPick = pgTable(
	"recommendation_pick",
	{
		userId: text("user_id").notNull(),
		rotation: integer("rotation").notNull(),
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
		position: integer("position").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.rotation, table.seriesId],
		}),
	],
);

/**
 * One episode's state for one user: whether they watched it, and where
 * playback of it stands. Every derived view of a series (season progress,
 * caught up, what to watch next) is read from these rows.
 *
 * Episodes are identified by their AniList-canonical number rather than a
 * provider episode ID, so progress survives switching providers and the
 * title being laid out again.
 */
export const playbackProgress = pgTable(
	"playback_progress",
	{
		userId: text("user_id").notNull(),
		anilistId: integer("anilist_id").notNull(),
		episode: doublePrecision("episode").notNull(),
		positionSeconds: doublePrecision("position_seconds").notNull(),
		durationSeconds: doublePrecision("duration_seconds").notNull(),
		/**
		 * Whether the user watched the episode, by playing it to the end or
		 * marking it. Playing it again does not take that back; only marking
		 * it unwatched does.
		 */
		watched: boolean("watched").notNull(),
		/** Client-side time of the event; later events win across devices. */
		eventAt: timestamptz("event_at").notNull(),
		updatedAt: timestamptz("updated_at").notNull().defaultNow(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.anilistId, table.episode],
		}),
		index("playback_progress_user_event_idx").on(table.userId, table.eventAt),
	],
);

/**
 * When a user last actually played each episode: their history. Only
 * playback writes it; marking an episode watched or unwatched or clearing
 * progress leave it as it is.
 */
export const playbackHistory = pgTable(
	"playback_history",
	{
		userId: text("user_id").notNull(),
		anilistId: integer("anilist_id").notNull(),
		episode: doublePrecision("episode").notNull(),
		/** How far that playback got. */
		positionSeconds: doublePrecision("position_seconds").notNull(),
		durationSeconds: doublePrecision("duration_seconds").notNull(),
		/** Client-side time of the latest playback event. */
		playedAt: timestamptz("played_at").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.anilistId, table.episode],
		}),
		index("playback_history_user_played_idx").on(table.userId, table.playedAt),
	],
);

/**
 * A series in someone's library that Sora watches for new episodes, and
 * since when. Episodes already out when watching started are no news.
 *
 * Rows go when no library holds the series any more, so a series added
 * again is watched afresh; see `recordReleases`.
 */
export const releaseWatch = pgTable("release_watch", {
	seriesId: text("series_id")
		.primaryKey()
		.references(() => series.id, {
			onDelete: "cascade",
		}),
	since: timestamptz("since").notNull(),
});

/**
 * An AniList episode of a watched series (see {@link releaseWatch}) that
 * seasons list, and when Sora first saw it listed. Notifications are read
 * from these: episodes of one season seen at the same moment make one.
 *
 * Keyed by AniList episode like {@link playbackProgress}, so a release is
 * not seen again when its series is laid out again or merged.
 */
export const episodeRelease = pgTable(
	"episode_release",
	{
		anilistId: integer("anilist_id").notNull(),
		anilistEpisode: integer("anilist_episode").notNull(),
		releasedAt: timestamptz("released_at").notNull(),
		/** Whether it came out while its series was watched, rather than being out already. */
		news: boolean("news").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.anilistId, table.anilistEpisode],
		}),
	],
);

/** When a user last saw their notifications; those released later are unread. */
export const notificationSeen = pgTable("notification_seen", {
	userId: text("user_id").primaryKey(),
	seenAt: timestamptz("seen_at").notNull(),
});

/**
 * A notification a user marked read, by its ID (see `Notification.id`).
 * Rows older than a notification is listed are pruned.
 */
export const notificationRead = pgTable(
	"notification_read",
	{
		userId: text("user_id").notNull(),
		notificationId: text("notification_id").notNull(),
		readAt: timestamptz("read_at").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.notificationId],
		}),
	],
);

/**
 * A notification a user deleted, by its ID (see `Notification.id`). It
 * stays hidden; rows older than a notification is listed are pruned.
 */
export const notificationDismissal = pgTable(
	"notification_dismissal",
	{
		userId: text("user_id").notNull(),
		notificationId: text("notification_id").notNull(),
		dismissedAt: timestamptz("dismissed_at").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.notificationId],
		}),
	],
);

/**
 * How one user likes episodes to play, remembered from what they pick in
 * the player. A user without a row plays everything the default way; see
 * `getPlaybackPreferences`.
 */
export const playbackPreference = pgTable("playback_preference", {
	userId: text("user_id").primaryKey(),
	/** `sub`, `dub`, or `raw`; `null` plays the first version an episode has. */
	audio: text("audio"),
	/**
	 * The subtitles picked for each audio, keyed by `sub` or `dub`: a track's
	 * language and kind, or `null` for none. An audio missing here shows its
	 * default track.
	 */
	subtitles: jsonb("subtitles").$type<unknown>().notNull().default({}),
	/** Whether openings and endings are skipped without asking. */
	autoSkip: boolean("auto_skip").notNull().default(false),
	updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});
