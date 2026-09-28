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

import { timestamptz } from "./columns";
import { series } from "./series";

/**
 * A user's relationship to a whole series, which only they can state:
 * `planning`, `watching`, `completed`, or `dropped`. It says
 * nothing about how far they are; that is read from {@link playbackProgress}.
 */
export const libraryStatus = pgEnum("library_status", [
	"planning",
	"watching",
	"completed",
	"dropped",
]);

/**
 * One series in one user's library, with the status they gave it. How far
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
 * An AniList entry imported into a user's library before its series was
 * stored. It becomes a {@link libraryEntry} once the series is; see
 * `resolveImportedEntries`.
 */
export const libraryImport = pgTable(
	"library_import",
	{
		userId: text("user_id").notNull(),
		anilistId: integer("anilist_id").notNull(),
		status: libraryStatus("status").notNull(),
		createdAt: timestamptz("created_at").notNull().defaultNow(),
	},
	(table) => [
		primaryKey({
			columns: [table.userId, table.anilistId],
		}),
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
 * playback writes it; marking an episode watched or unwatched, importing a
 * list, or clearing progress leave it as it is.
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
