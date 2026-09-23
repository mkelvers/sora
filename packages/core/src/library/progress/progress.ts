import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getAnime } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import { playbackProgress } from "../../database/schema";
import { InvalidInputError } from "../../errors";
import { getWatchlistStatus, writeWatchlistStatus, type WatchlistStatus } from "../watchlist/watchlist";
import type { EpisodeProgress } from "./resume";

/**
 * Share of an episode that must be watched for it to count as completed when
 * the client does not say. Leaves room for ending credits and previews.
 */
const completionRatio = 0.9;

/** Clients may report events slightly in the future because of clock skew. */
const allowedClockSkewMs = 5 * 60_000;

/** A playback checkpoint reported by a client. */
export const ProgressUpdateSchema = z
  .object({
    anilistId: z.number().int().positive(),
    episode: z.number().nonnegative(),
    positionSeconds: z.number().nonnegative(),
    durationSeconds: z.number().positive().max(24 * 60 * 60),
    /**
     * Explicit completion, for "mark as watched" actions. When omitted,
     * completion is derived from position and duration.
     */
    completed: z.boolean().optional(),
    /**
     * When the client observed this position. Later events win, so an old
     * checkpoint from an offline device cannot overwrite newer progress.
     */
    eventAt: z.iso.datetime({
      offset: true
    })
  })
  .refine((update) => update.positionSeconds <= update.durationSeconds, {
    message: "Position cannot exceed duration",
    path: ["positionSeconds"]
  });

export type ProgressUpdate = z.input<typeof ProgressUpdateSchema>;

/**
 * Records a playback checkpoint and keeps the watchlist in step with it.
 *
 * Watching an anime moves it to `watching` unless it is already `completed`
 * (a rewatch). Completing the final episode of a finished anime moves it to
 * `completed`.
 *
 * @throws {@link InvalidInputError} when the update fails validation.
 * @throws {@link AnimeNotFoundError} when the anime does not exist.
 */
export async function recordProgress(userId: string, update: ProgressUpdate) {
  const parsed = ProgressUpdateSchema.safeParse(update);
  if (!parsed.success) {
    throw new InvalidInputError("Invalid progress update", {
      cause: parsed.error
    });
  }

  const input = parsed.data;
  const now = Date.now();
  const eventAt = new Date(input.eventAt);
  if (eventAt.getTime() > now + allowedClockSkewMs) {
    throw new InvalidInputError("Progress event is in the future");
  }

  const anime = await getAnime(input.anilistId);
  const completed = input.completed ?? input.positionSeconds >= input.durationSeconds * completionRatio;
  const values = {
    positionSeconds: input.positionSeconds,
    durationSeconds: input.durationSeconds,
    completed,
    eventAt,
    updatedAt: new Date(now)
  };

  const [written] = await db
    .insert(playbackProgress)
    .values({
      userId,
      anilistId: input.anilistId,
      episode: input.episode,
      ...values
    })
    .onConflictDoUpdate({
      target: [
        playbackProgress.userId,
        playbackProgress.anilistId,
        playbackProgress.episode
      ],
      set: values,
      setWhere: sql`${playbackProgress.eventAt} < excluded.event_at`
    })
    .returning({
      episode: playbackProgress.episode
    });

  // A stale event changed nothing, so it must not change the watchlist either.
  if (!written) {
    return;
  }

  const current = await getWatchlistStatus(userId, input.anilistId);
  const finishedSeries = anime.status === "FINISHED" && anime.episodes !== null && input.episode >= anime.episodes;
  const next: WatchlistStatus | null =
    completed && finishedSeries ? "completed" : current === "completed" || current === "watching" ? null : "watching";

  if (next && next !== current) {
    await writeWatchlistStatus(userId, input.anilistId, next);
  }
}

/** Lists saved progress for every episode of one anime, in episode order. */
export async function getProgress(userId: string, anilistId: number): Promise<EpisodeProgress[]> {
  const rows = await db
    .select()
    .from(playbackProgress)
    .where(and(eq(playbackProgress.userId, userId), eq(playbackProgress.anilistId, anilistId)))
    .orderBy(asc(playbackProgress.episode));

  return rows.map(toEpisodeProgress);
}

/** Forgets all progress for one anime, for example to restart a series. */
export async function clearProgress(userId: string, anilistId: number) {
  await db
    .delete(playbackProgress)
    .where(and(eq(playbackProgress.userId, userId), eq(playbackProgress.anilistId, anilistId)));
}

export function toEpisodeProgress(row: typeof playbackProgress.$inferSelect): EpisodeProgress {
  return {
    episode: row.episode,
    positionSeconds: row.positionSeconds,
    durationSeconds: row.durationSeconds,
    completed: row.completed,
    eventAt: row.eventAt.toISOString()
  };
}
