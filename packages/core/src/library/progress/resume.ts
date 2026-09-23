import type { AnimeCard } from "../../catalog/models/anime";

/** Saved progress for one episode. */
export interface EpisodeProgress {
  episode: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  /** ISO 8601 timestamp of the event that produced this checkpoint. */
  eventAt: string;
}

/** Where to pick an anime back up. */
export interface ContinueWatchingItem {
  anime: AnimeCard;
  episode: number;
  /** Seek position; `0` when starting the next episode. */
  positionSeconds: number;
  /** Known duration of `episode`, or `null` when it has not been played yet. */
  durationSeconds: number | null;
  /** ISO 8601 timestamp of the last playback event for this anime. */
  lastWatchedAt: string;
}

/**
 * Decides where to resume an anime from its saved checkpoints, which must be
 * ordered most recent first.
 *
 * An unfinished latest episode resumes where it stopped. After a completed
 * episode, the next one resumes from its own checkpoint if one exists (it may
 * have been started earlier or on another device), or starts from zero if it
 * has been released. Returns `null` when there is nothing to continue.
 */
export function continuePoint(
  anime: AnimeCard,
  episodes: readonly EpisodeProgress[]
): Pick<ContinueWatchingItem, "episode" | "positionSeconds" | "durationSeconds"> | null {
  const latest = episodes[0];
  if (!latest) {
    return null;
  }

  if (!latest.completed) {
    return {
      episode: latest.episode,
      positionSeconds: latest.positionSeconds,
      durationSeconds: latest.durationSeconds
    };
  }

  const next = Math.floor(latest.episode) + 1;
  const started = episodes.find((episode) => episode.episode === next && !episode.completed);
  if (started) {
    return {
      episode: next,
      positionSeconds: started.positionSeconds,
      durationSeconds: started.durationSeconds
    };
  }

  return isReleased(anime, next)
    ? {
        episode: next,
        positionSeconds: 0,
        durationSeconds: null
      }
    : null;
}

/** Whether AniList's schedule says `episode` has aired. */
function isReleased(anime: AnimeCard, episode: number) {
  if (anime.nextEpisode) {
    return episode < anime.nextEpisode.number;
  }

  if (anime.status === "NOT_YET_RELEASED") {
    return false;
  }

  // Without a schedule, a known total is the only bound; an unknown total on a
  // releasing show means the next episode may already be out.
  return anime.episodes === null || episode <= anime.episodes;
}
