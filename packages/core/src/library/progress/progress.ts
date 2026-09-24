import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import { playbackProgress, series, seriesEntry, seriesEpisode, seriesSeason } from "../../database/schema";
import { InvalidInputError } from "../../errors";
import { locateEpisode, type LocatedEpisode } from "../../series/episodes";
import { assertSeriesExists } from "../../series/queries";
import { getWatchlistEntry, writeWatchlistStatus, type WatchlistStatus } from "../watchlist/watchlist";
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
    seasonId: z.string().min(1),
    /** Position within the season, from 1. */
    episode: z.number().int().positive(),
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
 * Checkpoints are stored against the AniList episode that plays the season
 * episode, so progress survives the title being laid out again.
 *
 * Watching a title moves it to `watching` unless it is already `completed`
 * (a rewatch). Completing the finale of a finished title moves it to
 * `completed`; see {@link isFinale}.
 *
 * @throws {@link InvalidInputError} when the update fails validation.
 * @throws {@link SeasonNotFoundError} when the season does not exist.
 * @throws {@link EpisodeNotFoundError} when the season has no such
 *   playable episode.
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

  const located = await locateEpisode(input.seasonId, input.episode);
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
      anilistId: located.anilistId,
      episode: located.anilistEpisode,
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

  const current = (await getWatchlistEntry(userId, located.seriesId))?.status ?? null;
  const next: WatchlistStatus | null =
    completed && (await isFinale(located)) ? "completed" : current === "completed" || current === "watching" ? null : "watching";

  if (next && next !== current) {
    await writeWatchlistStatus(userId, located.seriesId, next);
  }
}

/**
 * Lists saved progress for every episode of a title, in title order.
 *
 * Checkpoints for episodes the title no longer lists are left out.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function getProgress(userId: string, seriesId: string): Promise<EpisodeProgress[]> {
  await assertSeriesExists(seriesId);
  const rows = await db
    .select({
      progress: playbackProgress,
      seasonId: seriesEpisode.seasonId,
      number: seriesEpisode.number
    })
    .from(playbackProgress)
    .innerJoin(
      seriesEpisode,
      and(eq(seriesEpisode.anilistId, playbackProgress.anilistId), eq(seriesEpisode.anilistEpisode, playbackProgress.episode))
    )
    .innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
    .where(and(eq(playbackProgress.userId, userId), eq(seriesSeason.seriesId, seriesId)))
    .orderBy(asc(seriesSeason.position), asc(seriesEpisode.number));

  return rows.map((row) => toEpisodeProgress(row.progress, row.seasonId, row.number));
}

/**
 * Forgets all progress for a title, for example to restart it.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function clearProgress(userId: string, seriesId: string) {
  await assertSeriesExists(seriesId);
  await db.delete(playbackProgress).where(
    and(
      eq(playbackProgress.userId, userId),
      inArray(
        playbackProgress.anilistId,
        db
          .select({
            anilistId: seriesEntry.anilistId
          })
          .from(seriesEntry)
          .where(eq(seriesEntry.seriesId, seriesId))
      )
    )
  );
}

/** Builds a season checkpoint from a stored row and where its episode sits. */
export function toEpisodeProgress(row: typeof playbackProgress.$inferSelect, seasonId: string, episode: number): EpisodeProgress {
  return {
    seasonId,
    episode,
    positionSeconds: row.positionSeconds,
    durationSeconds: row.durationSeconds,
    completed: row.completed,
    eventAt: row.eventAt.toISOString()
  };
}

/**
 * Whether an episode ends a finished title: the last playable episode of its
 * last regular season (or film), or of its last season when it has only
 * OVAs. OVAs after the regular seasons do not have to be watched.
 */
async function isFinale(located: LocatedEpisode) {
  const [stored] = await db
    .select({
      status: series.status
    })
    .from(series)
    .where(eq(series.id, located.seriesId))
    .limit(1);
  if (stored?.status !== "FINISHED") {
    return false;
  }

  const playable = await db
    .select({
      seasonId: seriesEpisode.seasonId,
      number: seriesEpisode.number,
      kind: seriesSeason.kind
    })
    .from(seriesEpisode)
    .innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
    .where(and(eq(seriesSeason.seriesId, located.seriesId), isNotNull(seriesEpisode.anilistId)))
    .orderBy(desc(seriesSeason.position), desc(seriesEpisode.number));

  const finale = playable.find((episode) => episode.kind !== "ova") ?? playable[0];
  return finale?.seasonId === located.seasonId && finale.number === located.number;
}
