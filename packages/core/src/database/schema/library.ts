import { boolean, doublePrecision, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { timestamptz } from "./columns";
import { series } from "./series";

/**
 * One title on one user's watchlist: that they saved it, and whether they
 * gave up on it. How far they are through it is not stored here but read
 * from their progress, so it stays true as the title gains seasons.
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
        onDelete: "cascade",
      }),
    /** When the user marked the title dropped, or `null` while they have not. */
    droppedAt: timestamptz("dropped_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.userId,
        table.seriesId
      ],
    }),
    index("watchlist_entry_user_updated_idx").on(table.userId, table.updatedAt)
  ]
);

/**
 * An AniList entry imported onto a user's watchlist before its series was
 * stored. It becomes a {@link watchlistEntry} once the series is; see
 * `resolveImportedEntries`.
 */
export const watchlistImport = pgTable(
  "watchlist_import",
  {
    userId: text("user_id").notNull(),
    anilistId: integer("anilist_id").notNull(),
    droppedAt: timestamptz("dropped_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.userId,
        table.anilistId
      ],
    })
  ]
);

/**
 * A title the user removed from "continue watching". It stays hidden until
 * they play it again; it says nothing about whether they will.
 *
 * Follows its series through merges like {@link watchlistEntry}.
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
      columns: [
        table.userId,
        table.seriesId
      ],
    })
  ]
);

/**
 * The latest playback checkpoint for one episode: the user's history.
 *
 * Episodes are identified by their AniList-canonical number rather than a
 * provider episode ID, so progress survives switching providers and the
 * title being laid out again. A season counts as watched while the
 * checkpoint of its last playable episode is completed, so a cour merged in
 * behind it leaves the season unfinished again.
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
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.userId,
        table.anilistId,
        table.episode
      ],
    }),
    index("playback_progress_user_event_idx").on(table.userId, table.eventAt)
  ]
);
