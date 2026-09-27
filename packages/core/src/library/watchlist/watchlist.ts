import { and, count, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import { watchlistEntry, watchlistImport } from "../../database/schema";
import type { SeriesCard } from "../../series/models";
import { assertSeriesExists, toSeriesCards } from "../../series/queries";
import { day } from "../../time";
import { seasonStanding, unstartedSeason, watchStatus, type EpisodeProgress, type WatchStatus } from "../progress/resume";
import { loadCheckpoints, loadTitles, type LoadedTitles } from "../progress/titles";

export const WatchStatusSchema = z.enum([
  "planning",
  "watching",
  "completed",
  "dropped"
]);

/** A season of a title, named. */
export interface NamedSeason {
  seasonId: string;
  /** Such as "Season 2" or the film's title. */
  title: string;
}

/** Where a user is in the season they are in; see {@link seasonStanding}. */
export interface CurrentSeason extends NamedSeason {
  /** The episode to play next, or `null` when there is none to continue. */
  episode: number | null;
  watchedEpisodes: number;
  releasedEpisodes: number;
}

/** How far a user is through a title, read from their progress. */
export interface TitleState {
  status: WatchStatus;
  /** ISO 8601 timestamp of when the user dropped the title, or `null`. */
  droppedAt: string | null;
  /** The season the user is in, or `null` before they played anything. */
  currentSeason: CurrentSeason | null;
  /**
   * For a completed title, a season the user has not started that they can
   * watch, such as one released since they finished; otherwise `null`.
   */
  newSeason: NamedSeason | null;
  /** ISO 8601 timestamp of the last episode played, or `null`. */
  lastWatchedAt: string | null;
}

/** One title on a user's watchlist, with its card for display. */
export interface WatchlistItem extends TitleState {
  series: SeriesCard;
  /** ISO 8601 timestamp. */
  addedAt: string;
}

/** A user's watchlist, and how many of its titles are in each state. */
export interface Watchlist {
  items: WatchlistItem[];
  counts: Record<WatchStatus, number>;
  /** Imported titles still being prepared, which join the list once they are. */
  preparing: number;
}

/** Whether a title is on a user's watchlist, and how far they are through it. */
export interface LibraryTitle extends TitleState {
  listed: boolean;
  /** ISO 8601 timestamp, or `null` when not listed. */
  addedAt: string | null;
}

/**
 * Lists a user's watchlist, most recently active first: last played, or
 * else last listed or dropped.
 */
export async function getWatchlist(
  userId: string,
  filter: {
    status?: WatchStatus;
  } = {}
): Promise<Watchlist> {
  await resolveImportedEntries(userId);
  const [entries, [pending]] = await Promise.all([
    db.select().from(watchlistEntry).where(eq(watchlistEntry.userId, userId)),
    db
      .select({
        count: count(),
      })
      .from(watchlistImport)
      .where(eq(watchlistImport.userId, userId))
  ]);

  const seriesIds = entries.map((entry) => entry.seriesId);
  const [titles, checkpoints] = await Promise.all([
    loadTitles(seriesIds),
    loadCheckpoints(userId, seriesIds)
  ]);
  const cards = await toSeriesCards([...titles.series.values()]);

  const items = entries
    .flatMap((entry): WatchlistItem[] => {
      const card = cards.get(entry.seriesId);
      return card
        ? [
            {
              series: card,
              addedAt: entry.createdAt.toISOString(),
              ...titleState(titles, entry.seriesId, checkpoints.get(entry.seriesId) ?? [], entry.droppedAt),
            }
          ]
        : [];
    })
    .sort((left, right) => activeAt(right).localeCompare(activeAt(left)));

  const counts: Record<WatchStatus, number> = {
    planning: 0,
    watching: 0,
    completed: 0,
    dropped: 0,
  };
  for (const item of items) {
    counts[item.status] += 1;
  }

  return {
    items: filter.status ? items.filter((item) => item.status === filter.status) : items,
    counts,
    preparing: pending?.count ?? 0,
  };
}

/**
 * Whether a title is on a user's watchlist, and how far they are through
 * it, listed or not.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function getLibraryTitle(userId: string, seriesId: string): Promise<LibraryTitle> {
  await assertSeriesExists(seriesId);
  const [[entry], titles, checkpoints] = await Promise.all([
    db
      .select()
      .from(watchlistEntry)
      .where(and(eq(watchlistEntry.userId, userId), eq(watchlistEntry.seriesId, seriesId)))
      .limit(1),
    loadTitles([seriesId]),
    loadCheckpoints(userId, [seriesId])
  ]);

  return {
    listed: entry !== undefined,
    addedAt: entry?.createdAt.toISOString() ?? null,
    ...titleState(titles, seriesId, checkpoints.get(seriesId) ?? [], entry?.droppedAt ?? null),
  };
}

/**
 * How far a user is through each of the given titles, for callers that
 * weigh what a user watched, such as recommendations.
 */
export async function getTitleStates(userId: string, seriesIds: readonly string[]): Promise<Map<string, TitleState>> {
  const [entries, titles, checkpoints] = await Promise.all([
    db.select().from(watchlistEntry).where(eq(watchlistEntry.userId, userId)),
    loadTitles(seriesIds),
    loadCheckpoints(userId, seriesIds)
  ]);
  const droppedAt = new Map(entries.map((entry) => [entry.seriesId, entry.droppedAt]));

  return new Map(
    seriesIds.map((seriesId) => [seriesId, titleState(titles, seriesId, checkpoints.get(seriesId) ?? [], droppedAt.get(seriesId) ?? null)])
  );
}

/**
 * Puts a title on the watchlist. A title already listed is left as it is.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function addToWatchlist(userId: string, seriesId: string) {
  await assertSeriesExists(seriesId);
  await db
    .insert(watchlistEntry)
    .values({
      userId,
      seriesId,
    })
    .onConflictDoNothing();
}

/**
 * Marks a title dropped, putting it on the watchlist if it is not, or takes
 * that back. Its progress is kept either way; playing it again undrops it.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function setDropped(userId: string, seriesId: string, dropped: boolean) {
  await assertSeriesExists(seriesId);
  const now = new Date();
  const droppedAt = dropped ? now : null;
  await db
    .insert(watchlistEntry)
    .values({
      userId,
      seriesId,
      droppedAt,
    })
    .onConflictDoUpdate({
      target: [
        watchlistEntry.userId,
        watchlistEntry.seriesId
      ],
      set: {
        droppedAt,
        updatedAt: now,
      },
    });
}

/**
 * Removes a title from the watchlist. Its progress is kept, as history.
 *
 * @returns Whether the title was on the watchlist.
 */
export async function removeFromWatchlist(userId: string, seriesId: string): Promise<boolean> {
  const removed = await db
    .delete(watchlistEntry)
    .where(and(eq(watchlistEntry.userId, userId), eq(watchlistEntry.seriesId, seriesId)))
    .returning({
      seriesId: watchlistEntry.seriesId,
    });

  return removed.length > 0;
}

/**
 * Imported entries still waiting for their series after this long are
 * given up on: the entry could not be laid out, such as adult media.
 */
const importPatienceMs = day;

/**
 * Lists the imported entries whose series are stored by now: each series
 * joins the watchlist once, dropped only when every entry imported for it
 * was. A title the user listed themselves is left as it is. Entries still
 * waiting after {@link importPatienceMs} are given up on.
 */
export async function resolveImportedEntries(userId: string) {
  await db
    .delete(watchlistImport)
    .where(and(eq(watchlistImport.userId, userId), lt(watchlistImport.createdAt, new Date(Date.now() - importPatienceMs))));
  await db.execute(sql`
    with resolved as (
      delete from watchlist_import as imported
      using series_entry as entry
      where imported.user_id = ${userId} and entry.anilist_id = imported.anilist_id
      returning entry.series_id, imported.dropped_at, imported.created_at
    )
    insert into watchlist_entry (user_id, series_id, dropped_at, created_at, updated_at)
    select ${userId}, series_id, case when bool_and(dropped_at is not null) then max(dropped_at) end, min(created_at), now()
    from resolved
    group by series_id
    on conflict (user_id, series_id) do nothing
  `);
}

/** When a user last did anything with a listed title: played, dropped, or listed it. */
function activeAt(item: WatchlistItem) {
  return [item.lastWatchedAt, item.droppedAt].reduce<string>((latest, at) => (at !== null && at > latest ? at : latest), item.addedAt);
}

/** How far a user is through a loaded title; see {@link TitleState}. */
function titleState(titles: LoadedTitles, seriesId: string, progress: readonly EpisodeProgress[], droppedAt: Date | null): TitleState {
  const episodes = titles.episodes(seriesId);
  const status = watchStatus(episodes, progress, droppedAt !== null);
  const standing = seasonStanding(episodes, progress);
  const unstarted = status === "completed" ? unstartedSeason(episodes, progress) : null;
  const named = (id: string): NamedSeason => ({
    seasonId: id,
    title: titles.seasonTitles.get(id) ?? "",
  });

  return {
    status,
    droppedAt: droppedAt?.toISOString() ?? null,
    currentSeason: standing
      ? {
          ...named(standing.seasonId),
          episode: standing.episode,
          watchedEpisodes: standing.watchedEpisodes,
          releasedEpisodes: standing.releasedEpisodes,
        }
      : null,
    newSeason: unstarted ? named(unstarted) : null,
    lastWatchedAt: progress[0]?.eventAt ?? null,
  };
}
