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
}

/** Where {@link continuePoint} resumes. */
export type ContinuePoint = Pick<ContinueWatchingItem, "seasonId" | "episode" | "positionSeconds" | "durationSeconds">;

/**
 * Decides where to resume a title.
 *
 * An unfinished latest episode resumes where it stopped. After a completed
 * episode, the next playable episode follows, crossing into the next season
 * in watch order: the last episode of season 1 leads to the film after it
 * or to season 2, but the watch order does not lead into the extras. That next episode resumes
 * from its own checkpoint if one exists (it may have been started earlier or
 * on another device), or starts from zero if it has been released.
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
      durationSeconds: latest.durationSeconds
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
      durationSeconds: started.durationSeconds
    };
  }

  return next.isReleased
    ? {
        seasonId: next.seasonId,
        episode: next.number,
        positionSeconds: 0,
        durationSeconds: null
      }
    : null;
}
