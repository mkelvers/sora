import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { AnimeCard } from "../../catalog/models/anime";
import { getAnime, getAnimeCards } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import { watchlistEntry, watchlistStatus } from "../../database/schema";

export const WatchlistStatusSchema = z.enum(watchlistStatus.enumValues);

/**
 * - `watching`: in progress.
 * - `planning`: saved for later.
 * - `completed`: finished.
 * - `paused`: on hold, expected to resume.
 * - `dropped`: abandoned.
 */
export type WatchlistStatus = z.infer<typeof WatchlistStatusSchema>;

/** One anime on a user's watchlist. */
export interface WatchlistItem {
  anime: AnimeCard;
  status: WatchlistStatus;
  /** ISO 8601 timestamp. */
  addedAt: string;
  /** ISO 8601 timestamp of the last status change. */
  updatedAt: string;
}

/**
 * Lists a user's watchlist, most recently changed first.
 *
 * Anime that AniList no longer serves are omitted from the result but kept in
 * storage, so they reappear if AniList restores them.
 */
export async function getWatchlist(
  userId: string,
  filter: {
    status?: WatchlistStatus;
  } = {}
): Promise<WatchlistItem[]> {
  const rows = await db
    .select()
    .from(watchlistEntry)
    .where(
      and(
        eq(watchlistEntry.userId, userId),
        filter.status ? eq(watchlistEntry.status, filter.status) : undefined
      )
    )
    .orderBy(desc(watchlistEntry.updatedAt));

  const cards = new Map((await getAnimeCards(rows.map((row) => row.anilistId))).map((card) => [card.id, card]));

  return rows.flatMap((row) => {
    const anime = cards.get(row.anilistId);
    return anime
      ? [
          {
            anime,
            status: row.status,
            addedAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString()
          }
        ]
      : [];
  });
}

/** Returns the user's status for one anime, or `null` when it is not on their watchlist. */
export async function getWatchlistStatus(userId: string, anilistId: number): Promise<WatchlistStatus | null> {
  const [row] = await db
    .select({
      status: watchlistEntry.status
    })
    .from(watchlistEntry)
    .where(and(eq(watchlistEntry.userId, userId), eq(watchlistEntry.anilistId, anilistId)))
    .limit(1);

  return row ? row.status : null;
}

/**
 * Adds an anime to the watchlist or changes its status.
 *
 * @throws {@link AnimeNotFoundError} when the anime does not exist, so
 *   watchlists never accumulate IDs that cannot be displayed.
 */
export async function setWatchlistStatus(userId: string, anilistId: number, status: WatchlistStatus) {
  await getAnime(anilistId);
  await writeWatchlistStatus(userId, anilistId, status);
}

/** Removes an anime from the watchlist. Removing an absent entry is a no-op. */
export async function removeFromWatchlist(userId: string, anilistId: number) {
  await db
    .delete(watchlistEntry)
    .where(and(eq(watchlistEntry.userId, userId), eq(watchlistEntry.anilistId, anilistId)));
}

/** Upserts a status for an anime already known to exist. */
export async function writeWatchlistStatus(userId: string, anilistId: number, status: WatchlistStatus) {
  const now = new Date();
  await db
    .insert(watchlistEntry)
    .values({
      userId,
      anilistId,
      status,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [
        watchlistEntry.userId,
        watchlistEntry.anilistId
      ],
      set: {
        status,
        updatedAt: now
      }
    });
}
