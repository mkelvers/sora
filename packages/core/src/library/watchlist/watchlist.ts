import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import { series, watchlistEntry, watchlistStatus } from "../../database/schema";
import type { SeriesCard } from "../../series/models";
import { assertSeriesExists, toSeriesCard } from "../../series/queries";

export const WatchlistStatusSchema = z.enum(watchlistStatus.enumValues);

/**
 * - `watching`: in progress.
 * - `planning`: saved for later.
 * - `completed`: finished.
 * - `paused`: on hold, expected to resume.
 * - `dropped`: abandoned.
 */
export type WatchlistStatus = z.infer<typeof WatchlistStatusSchema>;

/** A title's place on a user's watchlist. */
export interface WatchlistEntry {
  seriesId: string;
  status: WatchlistStatus;
  /** ISO 8601 timestamp. */
  addedAt: string;
  /** ISO 8601 timestamp of the last status change. */
  updatedAt: string;
}

/** One title on a user's watchlist, with its card for display. */
export interface WatchlistItem extends Omit<WatchlistEntry, "seriesId"> {
  series: SeriesCard;
}

/** Lists a user's watchlist, most recently changed first. */
export async function getWatchlist(
  userId: string,
  filter: {
    status?: WatchlistStatus;
  } = {}
): Promise<WatchlistItem[]> {
  const rows = await db
    .select({
      entry: watchlistEntry,
      series
    })
    .from(watchlistEntry)
    .innerJoin(series, eq(series.id, watchlistEntry.seriesId))
    .where(
      and(
        eq(watchlistEntry.userId, userId),
        filter.status ? eq(watchlistEntry.status, filter.status) : undefined
      )
    )
    .orderBy(desc(watchlistEntry.updatedAt));

  return rows.map((row) => ({
    series: toSeriesCard(row.series),
    status: row.entry.status,
    addedAt: row.entry.createdAt.toISOString(),
    updatedAt: row.entry.updatedAt.toISOString()
  }));
}

/** Returns a title's watchlist entry, or `null` when it is not on the user's watchlist. */
export async function getWatchlistEntry(userId: string, seriesId: string): Promise<WatchlistEntry | null> {
  const [row] = await db
    .select()
    .from(watchlistEntry)
    .where(and(eq(watchlistEntry.userId, userId), eq(watchlistEntry.seriesId, seriesId)))
    .limit(1);

  return row ? toWatchlistEntry(row) : null;
}

/**
 * Adds a title to the watchlist or changes its status.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function setWatchlistStatus(userId: string, seriesId: string, status: WatchlistStatus): Promise<WatchlistEntry> {
  await assertSeriesExists(seriesId);
  return writeWatchlistStatus(userId, seriesId, status);
}

/**
 * Removes a title from the watchlist.
 *
 * @returns Whether the title was on the watchlist.
 */
export async function removeFromWatchlist(userId: string, seriesId: string): Promise<boolean> {
  const removed = await db
    .delete(watchlistEntry)
    .where(and(eq(watchlistEntry.userId, userId), eq(watchlistEntry.seriesId, seriesId)))
    .returning({
      seriesId: watchlistEntry.seriesId
    });

  return removed.length > 0;
}

/** Upserts a status for a title already known to exist. */
export async function writeWatchlistStatus(userId: string, seriesId: string, status: WatchlistStatus): Promise<WatchlistEntry> {
  const now = new Date();
  const [row] = await db
    .insert(watchlistEntry)
    .values({
      userId,
      seriesId,
      status,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [
        watchlistEntry.userId,
        watchlistEntry.seriesId
      ],
      set: {
        status,
        updatedAt: now
      }
    })
    .returning();

  if (!row) {
    throw new Error(`Writing the watchlist entry for series ${seriesId} returned no row`);
  }

  return toWatchlistEntry(row);
}

function toWatchlistEntry(row: typeof watchlistEntry.$inferSelect): WatchlistEntry {
  return {
    seriesId: row.seriesId,
    status: row.status,
    addedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
