import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import { continueWatchingDismissal, playbackProgress, seriesEntry, seriesEpisode, watchlistEntry } from "../../database/schema";
import { InvalidInputError, SeasonNotFoundError } from "../../errors";
import { locateEpisode } from "../../series/episodes";
import { assertSeriesExists } from "../../series/queries";
import { completedSeasons, type TitleProgress } from "./resume";
import { loadCheckpoints, loadTitles } from "./titles";

/**
 * Share of an episode that must be watched for it to count as completed when
 * the client does not say. Leaves room for ending credits and previews.
 */
const completionRatio = 0.9;

/** Clients may report events slightly in the future because of clock skew. */
const allowedClockSkewMs = 5 * 60_000;

/** Length assumed for an episode marked watched without playing it, when its runtime is unknown. */
const defaultEpisodeSeconds = 24 * 60;

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
      offset: true,
    }),
  })
  .refine((update) => update.positionSeconds <= update.durationSeconds, {
    message: "Position cannot exceed duration",
    path: ["positionSeconds"],
  });

export type ProgressUpdate = z.input<typeof ProgressUpdateSchema>;

/**
 * Records a playback checkpoint.
 *
 * Checkpoints are stored against the AniList episode that plays the season
 * episode, so progress survives the title being laid out again. They are
 * the user's history: how far they are through a title, and whether they
 * finished a season, are read from them.
 *
 * Playing a title puts it on the watchlist, undrops it, and brings it back
 * to "continue watching" if it was dismissed from there.
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
      cause: parsed.error,
    });
  }

  const input = parsed.data;
  const now = Date.now();
  const eventAt = new Date(input.eventAt);
  if (eventAt.getTime() > now + allowedClockSkewMs) {
    throw new InvalidInputError("Progress event is in the future");
  }

  const located = await locateEpisode(input.seasonId, input.episode);
  const written = await writeCheckpoints(userId, [
    {
      anilistId: located.anilistId,
      episode: located.anilistEpisode,
      positionSeconds: input.positionSeconds,
      durationSeconds: input.durationSeconds,
      completed: input.completed ?? input.positionSeconds >= input.durationSeconds * completionRatio,
      eventAt,
    }
  ]);

  // A stale event changed nothing, so it must not change the watchlist either.
  if (written > 0) {
    await markPlayed(userId, located.seriesId, eventAt);
  }
}

/**
 * Marks every released episode of a season, or of every season of a title
 * in watch order, watched or unwatched at once.
 *
 * Marking watched gives each episode a completed checkpoint; marking
 * unwatched forgets their checkpoints.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 * @throws {@link SeasonNotFoundError} when the title has no such season.
 */
export async function markWatched(
  userId: string,
  target: {
    seriesId: string;
    /** Only this season; every season in watch order when omitted. */
    seasonId?: string;
  },
  watched: boolean
) {
  await assertSeriesExists(target.seriesId);
  const titles = await loadTitles([target.seriesId]);
  const listed = titles.episodes(target.seriesId);
  if (target.seasonId !== undefined && !listed.some((episode) => episode.seasonId === target.seasonId)) {
    throw new SeasonNotFoundError(target.seasonId);
  }

  const marked = listed.filter(
    (episode) =>
      !episode.isExtra && episode.isReleased && (target.seasonId === undefined ? episode.inWatchOrder : episode.seasonId === target.seasonId)
  );
  if (marked.length === 0) {
    return;
  }

  const rows = await db
    .select({
      seasonId: seriesEpisode.seasonId,
      number: seriesEpisode.number,
      anilistId: seriesEpisode.anilistId,
      anilistEpisode: seriesEpisode.anilistEpisode,
      runtimeMinutes: seriesEpisode.runtimeMinutes,
    })
    .from(seriesEpisode)
    .where(inArray(seriesEpisode.seasonId, [...new Set(marked.map((episode) => episode.seasonId))]));
  const order = new Map(marked.map((episode, index) => [`${episode.seasonId}:${episode.number}`, index]));
  const episodes = rows
    .filter((row) => row.anilistId !== null && order.has(`${row.seasonId}:${row.number}`))
    .sort((left, right) => order.get(`${left.seasonId}:${left.number}`)! - order.get(`${right.seasonId}:${right.number}`)!);

  if (!watched) {
    await db.delete(playbackProgress).where(
      and(
        eq(playbackProgress.userId, userId),
        or(...episodes.map((row) => and(eq(playbackProgress.anilistId, row.anilistId!), eq(playbackProgress.episode, row.anilistEpisode!))))
      )
    );
    return;
  }

  // Episodes a user marks at once are recorded in watch order, a millisecond apart.
  const now = Date.now();
  await writeCheckpoints(
    userId,
    episodes.map((row, index) => {
      const seconds = (row.runtimeMinutes ?? 0) * 60 || defaultEpisodeSeconds;
      return {
        anilistId: row.anilistId!,
        episode: row.anilistEpisode!,
        positionSeconds: seconds,
        durationSeconds: seconds,
        completed: true,
        eventAt: new Date(now - episodes.length + index + 1),
      };
    })
  );
  await markPlayed(userId, target.seriesId, new Date(now));
}

/**
 * Lists a title's saved progress: the seasons watched to the end, and the
 * checkpoints of every episode, both in title order.
 *
 * Checkpoints for episodes the title no longer lists are left out, and a
 * season that gained episodes since it was finished is no longer complete.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function getProgress(userId: string, seriesId: string): Promise<TitleProgress> {
  await assertSeriesExists(seriesId);
  const [titles, checkpoints] = await Promise.all([
    loadTitles([seriesId]),
    loadCheckpoints(userId, [seriesId])
  ]);
  const episodes = titles.episodes(seriesId);
  const progress = checkpoints.get(seriesId) ?? [];
  const order = new Map(episodes.map((episode, index) => [`${episode.seasonId}:${episode.number}`, index]));

  return {
    completedSeasons: completedSeasons(episodes, progress),
    episodes: progress
      .filter((checkpoint) => order.has(`${checkpoint.seasonId}:${checkpoint.episode}`))
      .sort(
        (left, right) => order.get(`${left.seasonId}:${left.episode}`)! - order.get(`${right.seasonId}:${right.episode}`)!
      ),
  };
}

/**
 * Forgets all progress for a title, for example to start it over. It stays
 * on the watchlist, as not started.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function clearProgress(userId: string, seriesId: string) {
  await assertSeriesExists(seriesId);
  const entries = db
    .select({
      anilistId: seriesEntry.anilistId,
    })
    .from(seriesEntry)
    .where(eq(seriesEntry.seriesId, seriesId));

  await db.delete(playbackProgress).where(and(eq(playbackProgress.userId, userId), inArray(playbackProgress.anilistId, entries)));
}

/**
 * Forgets one episode's checkpoint, taking it out of the user's history.
 *
 * @returns Whether there was one.
 * @throws {@link SeasonNotFoundError} when the season does not exist.
 * @throws {@link EpisodeNotFoundError} when the season has no such
 *   playable episode.
 */
export async function forgetEpisode(userId: string, seasonId: string, episode: number): Promise<boolean> {
  const located = await locateEpisode(seasonId, episode);
  const removed = await db
    .delete(playbackProgress)
    .where(
      and(
        eq(playbackProgress.userId, userId),
        eq(playbackProgress.anilistId, located.anilistId),
        eq(playbackProgress.episode, located.anilistEpisode)
      )
    )
    .returning({
      episode: playbackProgress.episode,
    });

  return removed.length > 0;
}

/** One checkpoint to write; see {@link writeCheckpoints}. */
export interface CheckpointInput {
  anilistId: number;
  episode: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  eventAt: Date;
}

/** Checkpoint rows per insert, well under PostgreSQL's limit of 65,535 parameters. */
const checkpointBatch = 1_000;

/**
 * Upserts checkpoints. A checkpoint only replaces a saved one with an older
 * event, so an old event from an offline device changes nothing.
 *
 * @returns How many were written.
 */
export async function writeCheckpoints(userId: string, checkpoints: readonly CheckpointInput[]): Promise<number> {
  const updatedAt = new Date();
  let written = 0;
  for (let start = 0; start < checkpoints.length; start += checkpointBatch) {
    const rows = await db
      .insert(playbackProgress)
      .values(
        checkpoints.slice(start, start + checkpointBatch).map((checkpoint) => ({
          userId,
          ...checkpoint,
          updatedAt,
        }))
      )
      .onConflictDoUpdate({
        target: [
          playbackProgress.userId,
          playbackProgress.anilistId,
          playbackProgress.episode
        ],
        set: {
          positionSeconds: sql`excluded.position_seconds`,
          durationSeconds: sql`excluded.duration_seconds`,
          completed: sql`excluded.completed`,
          eventAt: sql`excluded.event_at`,
          updatedAt,
        },
        setWhere: sql`${playbackProgress.eventAt} < excluded.event_at`,
      })
      .returning({
        episode: playbackProgress.episode,
      });
    written += rows.length;
  }

  return written;
}

/**
 * Puts a title the user played at `playedAt` on their watchlist, undrops it
 * if they dropped it before then, and lifts an earlier dismissal from
 * "continue watching".
 */
async function markPlayed(userId: string, seriesId: string, playedAt: Date) {
  await db.transaction(async (tx) => {
    await tx
      .insert(watchlistEntry)
      .values({
        userId,
        seriesId,
      })
      .onConflictDoUpdate({
        target: [
          watchlistEntry.userId,
          watchlistEntry.seriesId
        ],
        set: {
          droppedAt: null,
          updatedAt: new Date(),
        },
        setWhere: and(isNotNull(watchlistEntry.droppedAt), lt(watchlistEntry.droppedAt, playedAt)),
      });

    await tx
      .delete(continueWatchingDismissal)
      .where(
        and(
          eq(continueWatchingDismissal.userId, userId),
          eq(continueWatchingDismissal.seriesId, seriesId),
          lt(continueWatchingDismissal.dismissedAt, playedAt)
        )
      );
  });
}
