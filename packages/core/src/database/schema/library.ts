import { boolean, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

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
