import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "../../database/client";
import { playbackProgress, seasonCompletion, series, seriesEpisode, seriesSeason, watchlistEntry } from "../../database/schema";
import { isEpisodeAvailable, isEpisodeShown, loadAniKotoEpisodes } from "../../series/episodes";
import { toSeriesCards } from "../../series/queries";
import { toEpisodeProgress } from "./progress";
import { continuePoint, type ContinueWatchingItem, type EpisodeProgress, type TitleEpisode } from "./resume";

/**
 * Builds the "continue watching" row: one entry per recently played title,
 * most recent first.
 *
 * Titles marked `completed` or `dropped` on the watchlist are left out, as
 * are titles with nothing left to watch. See {@link continuePoint} for how
 * the episode to resume is chosen; a completed season counts as a completed
 * checkpoint at the episode that ended it, since its own were cleared.
 */
export async function getContinueWatching(
  userId: string,
  options: {
    limit?: number;
    /** Only these titles, such as a title's page or a page of search results: at most one entry each. */
    seriesIds?: readonly string[];
  } = {}
): Promise<ContinueWatchingItem[]> {
  const only = options.seriesIds;
  if (only?.length === 0) {
    return [];
  }

  const limit = options.limit ?? only?.length ?? 20;
  const inTitles = only === undefined ? undefined : inArray(seriesSeason.seriesId, [...only]);
  const [checkpoints, completions] = await Promise.all([
    db
      .select({
        progress: playbackProgress,
        seriesId: seriesSeason.seriesId,
        seasonId: seriesEpisode.seasonId,
        position: seriesSeason.position,
        number: seriesEpisode.number
      })
      .from(playbackProgress)
      .innerJoin(
        seriesEpisode,
        and(eq(seriesEpisode.anilistId, playbackProgress.anilistId), eq(seriesEpisode.anilistEpisode, playbackProgress.episode))
      )
      .innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
      .where(and(eq(playbackProgress.userId, userId), inTitles)),
    db
      .select({
        completedAt: seasonCompletion.completedAt,
        seriesId: seriesSeason.seriesId,
        seasonId: seriesEpisode.seasonId,
        position: seriesSeason.position,
        number: seriesEpisode.number,
        durationMinutes: seriesEpisode.runtimeMinutes
      })
      .from(seasonCompletion)
      .innerJoin(
        seriesEpisode,
        and(eq(seriesEpisode.anilistId, seasonCompletion.anilistId), eq(seriesEpisode.anilistEpisode, seasonCompletion.episode))
      )
      .innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
      .where(and(eq(seasonCompletion.userId, userId), inTitles))
  ]);

  const rows = [
    ...checkpoints.map((row) => ({
      ...row,
      checkpoint: toEpisodeProgress(row.progress, row.seasonId, row.number)
    })),
    ...completions.map((row) => {
      const duration = (row.durationMinutes ?? 0) * 60;
      return {
        ...row,
        checkpoint: {
          seasonId: row.seasonId,
          episode: row.number,
          positionSeconds: duration,
          durationSeconds: duration,
          completed: true,
          eventAt: row.completedAt.toISOString()
        } satisfies EpisodeProgress
      };
    })
  ].sort(
    (left, right) =>
      right.checkpoint.eventAt.localeCompare(left.checkpoint.eventAt) || right.position - left.position || right.number - left.number
  );

  // Map insertion order keeps titles in order of their most recent event.
  const bySeries = new Map<string, EpisodeProgress[]>();
  for (const row of rows) {
    const known = bySeries.get(row.seriesId);
    if (known) {
      known.push(row.checkpoint);
    } else if (bySeries.size < limit * 2) {
      // Over-fetch, because some titles drop out once their episodes are known.
      bySeries.set(row.seriesId, [row.checkpoint]);
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
  const cards = await toSeriesCards(stored);

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
              series: cards.get(seriesId)!,
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
 * lookup of one title's episodes. Only the episodes seasons list count (see
 * {@link isEpisodeShown}); each is released once AniKoto carries it (see
 * {@link isEpisodeAvailable}).
 */
async function titleEpisodes(seriesIds: readonly string[]) {
  const rows = await db
    .select({
      seriesId: seriesSeason.seriesId,
      seasonId: seriesSeason.id,
      seasonKind: seriesSeason.kind,
      inWatchOrder: seriesSeason.inWatchOrder,
      number: seriesEpisode.number,
      anilistId: seriesEpisode.anilistId,
      anilistEpisode: seriesEpisode.anilistEpisode,
      airDate: seriesEpisode.airDate,
      airedAt: seriesEpisode.airedAt,
      tmdbEpisodeNumber: seriesEpisode.tmdbEpisodeNumber
    })
    .from(seriesEpisode)
    .innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
    .where(inArray(seriesSeason.seriesId, [...seriesIds]))
    .orderBy(asc(seriesSeason.seriesId), asc(seriesSeason.position), asc(seriesEpisode.number));
  const onAniKoto = await loadAniKotoEpisodes(rows.flatMap((row) => row.anilistId ?? []));

  const now = new Date();
  return (title: typeof series.$inferSelect): TitleEpisode[] =>
    rows
      .filter(
        (row) => row.seriesId === title.id && isEpisodeShown(title, { kind: row.seasonKind }, row, onAniKoto, now)
      )
      .map((row) => ({
        seasonId: row.seasonId,
        inWatchOrder: row.inWatchOrder,
        number: row.number,
        isExtra: row.anilistId === null,
        isReleased: isEpisodeAvailable(title, row, onAniKoto, now)
      }));
}
