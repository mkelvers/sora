import type { SeriesCard } from "../../series/models";

/** Saved progress for one season episode. */
export interface EpisodeProgress {
  seasonId: string;
  /** Position within the season, from 1. */
  episode: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  /** ISO 8601 timestamp of the event that produced this checkpoint. */
  eventAt: string;
}

/** A season watched to the end. */
export interface SeasonCompletion {
  seasonId: string;
  /** ISO 8601 timestamp of the event that completed its last episode. */
  completedAt: string;
}

/** A title's saved progress. */
export interface TitleProgress {
  completedSeasons: SeasonCompletion[];
  episodes: EpisodeProgress[];
}

/** Where to pick a title back up. */
export interface ContinueWatchingItem {
  series: SeriesCard;
  seasonId: string;
  /** Position within the season, from 1. */
  episode: number;
  /** Seek position; `0` when starting the next episode. */
  positionSeconds: number;
  /** Known duration of `episode`, or `null` when it has not been played yet. */
  durationSeconds: number | null;
  /** ISO 8601 timestamp of the last playback event for this title. */
  lastWatchedAt: string;
}

/** One episode of a title, as the resume rules see it. */
export interface TitleEpisode {
  seasonId: string;
  /** See `SeriesSeason.inWatchOrder`. */
  inWatchOrder: boolean;
  /** Position within the season, from 1. */
  number: number;
  /** An extra only TMDB lists, which cannot be played. */
  isExtra: boolean;
  isReleased: boolean;
  /** ISO 8601 timestamp of when it aired, or `null` when unknown. */
  releasedAt: string | null;
  /**
   * Whether it ends its season: the season's last playable episode, once
   * the season has finished airing. Watching it completes the season.
   */
  isFinale: boolean;
}

/** Where {@link continuePoint} resumes. */
export type ContinuePoint = Pick<ContinueWatchingItem, "seasonId" | "episode" | "positionSeconds" | "durationSeconds">;

/**
 * How far a user is through a title, read from their progress rather than
 * stored, so it stays true as the title gains seasons.
 *
 * - `planning`: listed, nothing played.
 * - `watching`: there is more to watch of what they started.
 * - `completed`: every season they started is watched to the end. A season
 *   released later that they have not started does not change that.
 * - `dropped`: they gave up on it, which only they can say.
 */
export type WatchStatus = "planning" | "watching" | "completed" | "dropped";

/**
 * Decides where to resume a title.
 *
 * An unfinished latest episode resumes where it stopped. After a completed
 * episode, the next playable episode follows, crossing into the next season
 * in watch order: the last episode of season 1 leads to the film after it
 * or to season 2, but the watch order does not lead into the extras. That
 * next episode resumes from its own checkpoint if one exists (it may have
 * been started earlier or on another device), or starts from zero if it has
 * been released.
 *
 * Within a season the next episode follows whenever it is released. The
 * next season only follows when it was already out as the last one was
 * finished: a season released afterwards is offered, not pushed.
 *
 * @param episodes - Every episode of the title, in title order: seasons in
 *   display order, episodes by number.
 * @param progress - The title's checkpoints, most recent first.
 * @returns Where to resume, or `null` when there is nothing to continue.
 */
export function continuePoint(episodes: readonly TitleEpisode[], progress: readonly EpisodeProgress[]): ContinuePoint | null {
  const latest = progress[0];
  if (!latest) {
    return null;
  }

  if (!latest.completed) {
    return {
      seasonId: latest.seasonId,
      episode: latest.episode,
      positionSeconds: latest.positionSeconds,
      durationSeconds: latest.durationSeconds,
    };
  }

  const index = episodes.findIndex((episode) => episode.seasonId === latest.seasonId && episode.number === latest.episode);
  const current = episodes[index];
  const next = index >= 0 ? episodes.slice(index + 1).find((episode) => !episode.isExtra) : undefined;
  if (!current || !next || next.inWatchOrder !== current.inWatchOrder) {
    return null;
  }

  const started = progress.find(
    (checkpoint) => checkpoint.seasonId === next.seasonId && checkpoint.episode === next.number && !checkpoint.completed
  );
  if (started) {
    return {
      seasonId: next.seasonId,
      episode: next.number,
      positionSeconds: started.positionSeconds,
      durationSeconds: started.durationSeconds,
    };
  }

  const releasedSince = next.seasonId !== current.seasonId && next.releasedAt !== null && next.releasedAt > latest.eventAt;
  return next.isReleased && !releasedSince
    ? {
        seasonId: next.seasonId,
        episode: next.number,
        positionSeconds: 0,
        durationSeconds: null,
      }
    : null;
}

/**
 * The seasons watched to the end: those whose finale (see
 * {@link TitleEpisode.isFinale}) has a completed checkpoint, in title order.
 */
export function completedSeasons(episodes: readonly TitleEpisode[], progress: readonly EpisodeProgress[]): SeasonCompletion[] {
  return episodes.flatMap((episode) => {
    const checkpoint = episode.isFinale ? find(progress, episode) : undefined;
    return checkpoint?.completed
      ? [
          {
            seasonId: episode.seasonId,
            completedAt: checkpoint.eventAt,
          }
        ]
      : [];
  });
}

/**
 * How far a user is through a title; see {@link WatchStatus}.
 *
 * @param progress - The title's checkpoints, most recent first.
 * @param dropped - Whether the user marked the title dropped.
 */
export function watchStatus(episodes: readonly TitleEpisode[], progress: readonly EpisodeProgress[], dropped: boolean): WatchStatus {
  if (dropped) {
    return "dropped";
  }

  const listed = progress.filter((checkpoint) => episodes.some((episode) => isAt(checkpoint, episode)));
  if (listed.length === 0) {
    return "planning";
  }

  const completed = new Set(completedSeasons(episodes, listed).map((season) => season.seasonId));
  const started = new Set(listed.map((checkpoint) => checkpoint.seasonId));
  const finished = [...started].every((seasonId) => completed.has(seasonId));
  return finished && continuePoint(episodes, listed) === null ? "completed" : "watching";
}

/** Where a user is in one season of a title. */
export interface SeasonStanding {
  seasonId: string;
  /** The episode to play next, or `null` when there is none to continue. */
  episode: number | null;
  /** Released episodes of the season watched to the end. */
  watchedEpisodes: number;
  /** Released episodes of the season, extras aside. */
  releasedEpisodes: number;
}

/**
 * The season a user is in: the one they would continue with, or else the
 * one they played last. `null` before they played anything.
 *
 * @param progress - The title's checkpoints, most recent first.
 */
export function seasonStanding(episodes: readonly TitleEpisode[], progress: readonly EpisodeProgress[]): SeasonStanding | null {
  const point = continuePoint(episodes, progress);
  const seasonId = point?.seasonId ?? progress.find((checkpoint) => episodes.some((episode) => isAt(checkpoint, episode)))?.seasonId;
  if (seasonId === undefined) {
    return null;
  }

  const released = episodes.filter((episode) => episode.seasonId === seasonId && episode.isReleased && !episode.isExtra);
  return {
    seasonId,
    episode: point?.episode ?? null,
    watchedEpisodes: released.filter((episode) => find(progress, episode)?.completed).length,
    releasedEpisodes: released.length,
  };
}

/**
 * The first season in watch order after the furthest one a user started
 * that they have not started and can watch: what a title offers once they
 * are through what they began. `null` when there is none, or before they
 * played anything.
 *
 * @param progress - The title's checkpoints, most recent first.
 */
export function unstartedSeason(episodes: readonly TitleEpisode[], progress: readonly EpisodeProgress[]): string | null {
  const ordered = episodes.filter((episode) => episode.inWatchOrder && !episode.isExtra);
  const furthest = ordered.findLastIndex((episode) => progress.some((checkpoint) => checkpoint.seasonId === episode.seasonId));
  if (furthest === -1) {
    return null;
  }

  const startedSeason = ordered[furthest]!.seasonId;
  const next = ordered.slice(furthest + 1).find((episode) => episode.seasonId !== startedSeason && episode.isReleased);
  return next && !progress.some((checkpoint) => checkpoint.seasonId === next.seasonId) ? next.seasonId : null;
}

function isAt(checkpoint: EpisodeProgress, episode: TitleEpisode) {
  return checkpoint.seasonId === episode.seasonId && checkpoint.episode === episode.number;
}

function find(progress: readonly EpisodeProgress[], episode: TitleEpisode) {
  return progress.find((checkpoint) => isAt(checkpoint, episode));
}
