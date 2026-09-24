import { boolean, doublePrecision, index, integer, pgEnum, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { timestamptz } from "./columns";
import { series } from "./series";

export const watchlistStatus = pgEnum("watchlist_status", [
  "watching",
  "planning",
  "completed",
  "paused",
  "dropped"
]);

/**
 * One title on one user's watchlist.
 *
 * Entries follow their series: when two stored series are merged, the
 * series store moves the entries of the one that disappears.
 */
export const watchlistEntry = pgTable(
  "watchlist_entry",
  {
    userId: text("user_id").notNull(),
    seriesId: text("series_id")
      .notNull()
      .references(() => series.id, {
        onDelete: "cascade"
      }),
    status: watchlistStatus("status").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [
        table.userId,
        table.seriesId
      ]
    }),
    index("watchlist_entry_user_updated_idx").on(table.userId, table.updatedAt)
  ]
);

/**
 * The latest playback checkpoint for one episode.
 *
 * Episodes are identified by their AniList-canonical number rather than a
 * provider episode ID, so progress survives switching providers.
 */
export const playbackProgress = pgTable(
  "playback_progress",
  {
    userId: text("user_id").notNull(),
    anilistId: integer("anilist_id").notNull(),
    episode: doublePrecision("episode").notNull(),
    positionSeconds: doublePrecision("position_seconds").notNull(),
    durationSeconds: doublePrecision("duration_seconds").notNull(),
    completed: boolean("completed").notNull(),
    /** Client-side time of the event; later events win across devices. */
    eventAt: timestamptz("event_at").notNull(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      columns: [
        table.userId,
        table.anilistId,
        table.episode
      ]
    }),
    index("playback_progress_user_event_idx").on(table.userId, table.eventAt)
  ]
);
