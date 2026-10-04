import { sql } from "drizzle-orm";
import {
	boolean,
	check,
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
 * runs. Written while the episode plays; see `saveProgress`. A rewatch of a
 * series (see `seriesState.rewatchStartedAt`) has rows of its own, so
 * playing it never changes what the user watched before.
 */
export const episodeProgress = pgTable(
	"episode_progress",
	{
		userId: text("user_id").notNull(),
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
		/** The episode's number in the series, from 1. */
		episode: integer("episode").notNull(),
		positionSeconds: integer("position_seconds").notNull(),
		durationSeconds: integer("duration_seconds").notNull(),
		/** Whether the user stopped where the episode is over; see `Progress.finished`. */
		finished: boolean("finished").notNull(),
		/** When the user last played the episode. */
		watchedAt: timestamptz("watched_at").notNull().defaultNow(),
		/**
		 * Whether the row is from the rewatch the user is in the middle of
		 * rather than from their first viewing. Ending the rewatch deletes it.
		 */
		rewatch: boolean("rewatch").notNull().default(false),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.seriesId, table.episode, table.rewatch],
		}),
		index("episode_progress_watched_at_idx").on(table.userId, table.watchedAt),
	],
);

/** Where one user is with a series on their watchlist; see `WatchlistStatus`. */
export const watchlistStatus = pgEnum("watchlist_status", [
	"watching",
	"plan_to_watch",
	"completed",
	"dropped",
]);

/**
 * What one user decided about one series, as against the episodes they
 * played of it, which {@link episodeProgress} holds: whether it is on their
 * watchlist and with what status, whether they are watching it again, and
 * whether they took it out of Continue Watching. A row left with none of
 * these is deleted; see `clearSeriesState`.
 */
export const seriesState = pgTable(
	"series_state",
	{
		userId: text("user_id").notNull(),
		seriesId: text("series_id")
			.notNull()
			.references(() => series.id, {
				onDelete: "cascade",
			}),
		/**
		 * The series' status on the watchlist; `null` when it is not on it. The
		 * user sets it; playing an episode moves it on as `statusAfterPlayback`
		 * says. Taking the series off the watchlist keeps the user's progress.
		 */
		status: watchlistStatus("status"),
		/** When the series was put on the watchlist; `null` when it is not on it. */
		addedAt: timestamptz("added_at"),
		/** When the status last changed; `null` when it is not on the watchlist. */
		statusChangedAt: timestamptz("status_changed_at"),
		/**
		 * When the user started watching the series again from the start, after
		 * finishing it. While it is set, their progress is the rewatch's own
		 * (see `episodeProgress.rewatch`); finishing the last episode again, or
		 * marking the series watched, clears it. See `startRewatch`.
		 */
		rewatchStartedAt: timestamptz("rewatch_started_at"),
		/**
		 * When the user took the series' card out of Continue Watching. The card
		 * stays out until they play an episode after this; see
		 * `dismissContinueWatching`.
		 */
		dismissedAt: timestamptz("dismissed_at"),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.seriesId],
		}),
		index("series_state_status_changed_at_idx").on(table.userId, table.statusChangedAt),
		check(
			"series_state_watchlist_check",
			sql`(${table.status} is null) = (${table.addedAt} is null) and (${table.status} is null) = (${table.statusChangedAt} is null)`,
		),
	],
);

/**
 * The notifications one user marked read. A notification is not stored:
 * `getNotifications` works out what came out from the watchlist and the
 * episodes' release times, so only the user's marks are. A mark is deleted
 * once its notification would no longer be listed.
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

/** The notifications one user deleted, kept until they would no longer be listed anyway. */
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
