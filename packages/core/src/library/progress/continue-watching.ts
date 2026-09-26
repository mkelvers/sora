import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "../../database/client";
import { playbackProgress, series, seriesEpisode, seriesSeason, watchlistEntry } from "../../database/schema";
import { toSeriesCard } from "../../series/queries";
import { toEpisodeProgress } from "./progress";
import { continuePoint, type ContinueWatchingItem, type EpisodeProgress, type TitleEpisode } from "./resume";

/**
 * Builds the "continue watching" row: one entry per recently played title,
 * most recent first.
 *
 * Titles marked `completed` or `dropped` on the watchlist are left out, as
 * are titles with nothing left to watch. See {@link continuePoint} for how
 * the episode to resume is chosen.
 */
export async function getContinueWatching(userId: string, limit = 20): Promise<ContinueWatchingItem[]> {
  const rows = await db
    .select({
      progress: playbackProgress,
      seriesId: seriesSeason.seriesId,
      seasonId: seriesEpisode.seasonId,
      number: seriesEpisode.number
    })
    .from(playbackProgress)
    .innerJoin(
      seriesEpisode,
      and(eq(seriesEpisode.anilistId, playbackProgress.anilistId), eq(seriesEpisode.anilistEpisode, playbackProgress.episode))
    )
    .innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
    .where(eq(playbackProgress.userId, userId))
    .orderBy(desc(playbackProgress.eventAt), desc(seriesSeason.position), desc(seriesEpisode.number));

  // Map insertion order keeps titles in order of their most recent event.
  const bySeries = new Map<string, EpisodeProgress[]>();
  for (const row of rows) {
    const checkpoints = bySeries.get(row.seriesId);
    const checkpoint = toEpisodeProgress(row.progress, row.seasonId, row.number);
    if (checkpoints) {
      checkpoints.push(checkpoint);
    } else if (bySeries.size < limit * 2) {
      // Over-fetch, because some titles drop out once their episodes are known.
      bySeries.set(row.seriesId, [checkpoint]);
    }
  }

  const seriesIds = [...bySeries.keys()];
  if (seriesIds.length === 0) {
    return [];
  }

  const [finished, stored, episodes] = await Promise.all([
    db
      .select({
        seriesId: watchlistEntry.seriesId
      })
      .from(watchlistEntry)
      .where(
        and(
          eq(watchlistEntry.userId, userId),
          inArray(watchlistEntry.seriesId, seriesIds),
          inArray(watchlistEntry.status, [
            "completed",
            "dropped"
          ])
        )
      ),
    db.select().from(series).where(inArray(series.id, seriesIds)),
    titleEpisodes(seriesIds)
  ]);

  const excluded = new Set(finished.map((row) => row.seriesId));
  const seriesById = new Map(stored.map((row) => [row.id, row]));

  return [...bySeries]
    .flatMap(([seriesId, checkpoints]): ContinueWatchingItem[] => {
      const row = seriesById.get(seriesId);
      if (!row || excluded.has(seriesId)) {
        return [];
      }

      const point = continuePoint(episodes(row), checkpoints);
      return point
        ? [
            {
              series: toSeriesCard(row),
              ...point,
              lastWatchedAt: checkpoints[0]!.eventAt
            }
          ]
        : [];
    })
    .slice(0, limit);
}

/**
 * Loads every episode of the given titles in title order, and returns a
 * lookup of one title's episodes with their release state.
 *
 * An episode has not been released while it is at or past the title's
 * announced next episode, or while TMDB dates it in the future.
 */
async function titleEpisodes(seriesIds: readonly string[]) {
  const rows = await db
    .select({
      seriesId: seriesSeason.seriesId,
      seasonId: seriesSeason.id,
      inWatchOrder: seriesSeason.inWatchOrder,
      number: seriesEpisode.number,
      anilistId: seriesEpisode.anilistId,
      airDate: seriesEpisode.airDate
    })
    .from(seriesEpisode)
    .innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
    .where(inArray(seriesSeason.seriesId, [...seriesIds]))
    .orderBy(asc(seriesSeason.seriesId), asc(seriesSeason.position), asc(seriesEpisode.number));

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  return (title: typeof series.$inferSelect): TitleEpisode[] => {
    const isAhead = title.nextEpisodeAiringAt !== null && title.nextEpisodeAiringAt > now;
    return rows
      .filter((row) => row.seriesId === title.id)
      .map((row) => {
        const isAtOrAfterNext =
          isAhead && row.seasonId === title.nextEpisodeSeasonId && title.nextEpisodeNumber !== null && row.number >= title.nextEpisodeNumber;
        return {
          seasonId: row.seasonId,
          inWatchOrder: row.inWatchOrder,
          number: row.number,
          isExtra: row.anilistId === null,
          isReleased: !isAtOrAfterNext && (row.airDate === null || row.airDate <= today)
        };
      });
  };
}
