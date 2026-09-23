import { and, desc, eq } from "drizzle-orm";

import { getAnimeCards } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import { playbackProgress, watchlistEntry } from "../../database/schema";
import { toEpisodeProgress } from "./progress";
import { continuePoint, type ContinueWatchingItem, type EpisodeProgress } from "./resume";

/**
 * Builds the "continue watching" row: one entry per recently played anime,
 * most recent first.
 *
 * Anime marked `completed` or `dropped` on the watchlist are left out, as are
 * anime with nothing left to watch. See {@link continuePoint} for how the
 * episode to resume is chosen.
 */
export async function getContinueWatching(userId: string, limit = 20): Promise<ContinueWatchingItem[]> {
  const rows = await db
    .select({
      progress: playbackProgress,
      status: watchlistEntry.status
    })
    .from(playbackProgress)
    .leftJoin(
      watchlistEntry,
      and(eq(watchlistEntry.userId, playbackProgress.userId), eq(watchlistEntry.anilistId, playbackProgress.anilistId))
    )
    .where(eq(playbackProgress.userId, userId))
    .orderBy(desc(playbackProgress.eventAt), desc(playbackProgress.episode));

  // Map insertion order keeps anime in order of their most recent event.
  const byAnime = new Map<number, EpisodeProgress[]>();
  for (const { progress, status } of rows) {
    if (status === "completed" || status === "dropped") {
      continue;
    }

    const episodes = byAnime.get(progress.anilistId);
    if (episodes) {
      episodes.push(toEpisodeProgress(progress));
    } else if (byAnime.size < limit * 2) {
      // Over-fetch, because some anime drop out once release data is known.
      byAnime.set(progress.anilistId, [toEpisodeProgress(progress)]);
    }
  }

  const cards = new Map((await getAnimeCards([...byAnime.keys()])).map((card) => [card.id, card]));

  return [...byAnime]
    .flatMap(([anilistId, episodes]): ContinueWatchingItem[] => {
      const anime = cards.get(anilistId);
      const point = anime ? continuePoint(anime, episodes) : null;
      if (!anime || !point) {
        return [];
      }

      return [
        {
          anime,
          ...point,
          lastWatchedAt: episodes[0]!.eventAt
        }
      ];
    })
    .slice(0, limit);
}
