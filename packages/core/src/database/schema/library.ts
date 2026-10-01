import { boolean, index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

import { jsonb, timestamptz } from "./columns";
import { series, seriesSeason } from "./series";

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

/**
 * How far one user is into one episode: where they stopped, of how long it
 * runs. Written while the episode plays; see `saveProgress`.
 *
 * An episode is addressed as clients address it, by season and number, so
 * progress goes with a season that is laid out away.
 */
export const episodeProgress = pgTable(
	"episode_progress",
	{
		userId: text("user_id").notNull(),
		seasonId: text("season_id")
			.notNull()
			.references(() => seriesSeason.id, {
				onDelete: "cascade",
			}),
		/** Position within the season, from 1. */
		episode: integer("episode").notNull(),
		positionSeconds: integer("position_seconds").notNull(),
		durationSeconds: integer("duration_seconds").notNull(),
		/** Whether the user stopped where the episode is over; see `Progress.finished`. */
		finished: boolean("finished").notNull(),
		/** When the user last played the episode. */
		watchedAt: timestamptz("watched_at").notNull().defaultNow(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.seasonId, table.episode],
		}),
		index("episode_progress_watched_at_idx").on(table.userId, table.watchedAt),
	],
);

/**
 * An episode one user watched: finished in a player, or marked watched
 * without playing it (see `markSeason`). A user's history is these rows,
 * the newest first; see `getHistory`.
 *
 * Written once, when `saveProgress` first hears the episode is over, and
 * never changed by playing the episode again, so stopping partway through a
 * rewatch leaves it watched.
 *
 * Addressed by season and number, as {@link episodeProgress} is.
 */
export const watchedEpisode = pgTable(
	"watched_episode",
	{
		userId: text("user_id").notNull(),
		seasonId: text("season_id")
			.notNull()
			.references(() => seriesSeason.id, {
				onDelete: "cascade",
			}),
		/** Position within the season, from 1. */
		episode: integer("episode").notNull(),
		/**
		 * When the user first finished the episode, or marked it. Kept to the
		 * millisecond, which is all a page's cursor can carry; see `getHistory`.
		 */
		finishedAt: timestamp("finished_at", {
			withTimezone: true,
			precision: 3,
		})
			.notNull()
			.defaultNow(),
		/**
		 * Whether the user marked the episode watched rather than finished it.
		 * A marked episode has no progress, so it is what tells where the user
		 * is in the show; see `getContinueWatching`.
		 */
		marked: boolean("marked").notNull().default(false),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.seasonId, table.episode],
		}),
		index("watched_episode_finished_at_idx").on(table.userId, table.finishedAt),
	],
);

/**
 * A series in one user's Shows: one they saved to watch later, or started
 * watching. Playing an episode puts its series here; only the user takes
 * it out again, which keeps their progress and history. See `getShows`.
 */
export const profileShow = pgTable(
	"profile_show",
	{
		userId: text("user_id").notNull(),
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
		addedAt: timestamptz("added_at").notNull().defaultNow(),
		/**
		 * When the user took the series' card out of Continue Watching. The
		 * card stays out until they play or mark an episode of it after this;
		 * see `getContinueWatching`.
		 */
		dismissedAt: timestamptz("dismissed_at"),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.seriesId],
		}),
	],
);

/**
 * A series one user dropped: all of it, never one season. A dropped series
 * keeps its progress and history, and is left out of Continue Watching and
 * of what Sora suggests, with the series related to it. Only the user ends
 * a drop; new episodes and playing one do not. See `dropShow`.
 */
export const droppedSeries = pgTable(
	"dropped_series",
	{
		userId: text("user_id").notNull(),
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
		droppedAt: timestamptz("dropped_at").notNull().defaultNow(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.seriesId],
		}),
	],
);

/**
 * A notification one user marked read, by its ID (see `Notification.id`).
 * Rows older than a notification is listed go when the user next marks one;
 * see `markNotificationsRead`.
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
 * A notification one user deleted, by its ID (see `Notification.id`). It is
 * never listed again. Rows older than a notification is listed go when the
 * user next deletes one; see `dismissNotification`.
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
