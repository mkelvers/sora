import type { AnimeStatus } from "../../catalog/models/anime";
import { day, hour, minute } from "../../time";

/** What one airing check learned about an anime. */
export interface AiringState {
  status: AnimeStatus | null;
  /** When AniList expects the next episode, if it has announced one. */
  nextAiringAt: Date | null;
  /** The latest episode AniList says has aired, or `null` when none has. */
  latestAiredEpisode: number | null;
  /** The latest episode in the list viewers see, or `null` when no provider has any. */
  latestReleasedEpisode: number | null;
  /** AniList's start date: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, in Japan time. */
  startDate: string | null;
}

/** Where the previous check left off; see `TrackAiringPayload`. */
export interface AiringProgress {
  awaitedEpisode: number | null;
  attempt: number;
}

/** When to check again, and what that check is waiting for. */
export type AiringPlan =
  | {
      done: true;
    }
  | {
      done: false;
      runAt: Date;
      awaitedEpisode: number | null;
      attempt: number;
    };

/**
 * Waits between checks for an episode that has aired but that no provider
 * carries yet. Providers usually post subs within hours, sometimes a day
 * later; the last delay repeats.
 */
export const releaseRetryDelaysMs = [
  15 * minute,
  30 * minute,
  hour,
  2 * hour,
  4 * hour,
  8 * hour,
  12 * hour
] as const;

/**
 * Checks for one episode stop after this many attempts, about three days
 * after it aired. The next broadcast starts a new round for the next episode.
 */
export const maximumReleaseAttempts = 11;

/** How often to check on premiere day when AniList has a date but no time. */
export const premiereDayCheckIntervalMs = 20 * minute;

/** How often to ask AniList about an airing anime with no announced episode. */
const unscheduledCheckIntervalMs = day;

/** How often to ask AniList about an anime on hiatus. */
const hiatusCheckIntervalMs = 7 * day;

/** Japan Standard Time, which AniList's dates are in, is UTC+9. */
const japanOffsetMs = 9 * hour;

/**
 * Decides when to check an anime again.
 *
 * The next check is the earliest of:
 *
 * - a retry, when an aired episode is missing from every provider;
 * - the next broadcast AniList has announced;
 * - for an anime that has not premiered and has a start date but no airing
 *   time, the start of premiere day, then every 20 minutes through that day;
 * - otherwise a routine check: daily, or weekly on hiatus.
 *
 * Tracking ends once the anime is finished or cancelled and every aired
 * episode has been released, or has been waited on for
 * {@link maximumReleaseAttempts} checks.
 */
export function planNextCheck(state: AiringState, progress: AiringProgress, now: Date): AiringPlan {
  const behind =
    state.latestAiredEpisode !== null && (state.latestReleasedEpisode ?? 0) < state.latestAiredEpisode;
  const awaitedEpisode = behind ? state.latestAiredEpisode : null;
  const attempt = awaitedEpisode !== null && awaitedEpisode === progress.awaitedEpisode ? progress.attempt + 1 : 0;
  const retryAt =
    awaitedEpisode !== null && attempt < maximumReleaseAttempts
      ? new Date(now.getTime() + releaseRetryDelaysMs[Math.min(attempt, releaseRetryDelaysMs.length - 1)]!)
      : null;

  if (state.status === "FINISHED" || state.status === "CANCELLED") {
    return retryAt
      ? {
          done: false,
          runAt: retryAt,
          awaitedEpisode,
          attempt
        }
      : {
          done: true
        };
  }

  const scheduledAt = nextScheduledCheck(state, now);
  return {
    done: false,
    runAt: retryAt && retryAt < scheduledAt ? retryAt : scheduledAt,
    awaitedEpisode,
    attempt
  };
}

/** The next check that does not depend on a missing release. */
function nextScheduledCheck(state: AiringState, now: Date): Date {
  if (state.nextAiringAt) {
    // A broadcast time in the past means AniList has not caught up yet.
    return state.nextAiringAt > now ? state.nextAiringAt : new Date(now.getTime() + premiereDayCheckIntervalMs);
  }

  const premiereDay = state.status === "NOT_YET_RELEASED" ? japanDay(state.startDate) : null;
  if (premiereDay && now < premiereDay.end) {
    return now < premiereDay.start ? premiereDay.start : new Date(now.getTime() + premiereDayCheckIntervalMs);
  }

  return new Date(
    now.getTime() + (state.status === "HIATUS" ? hiatusCheckIntervalMs : unscheduledCheckIntervalMs)
  );
}

/** The span of a `YYYY-MM-DD` date in Japan, or `null` for a less precise date. */
function japanDay(date: string | null) {
  const match = date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  if (!match) {
    return null;
  }

  const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - japanOffsetMs;
  return {
    start: new Date(start),
    end: new Date(start + day)
  };
}
