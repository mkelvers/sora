import type { AnimeStatus } from "../../catalog/models/anime";
import { day, hour, minute } from "../../time";

/** What one airing check learned about an anime. */
export interface AiringState {
	status: AnimeStatus | null;
	/** When AniList expects the next episode, if it has announced one. */
	nextAiringAt: Date | null;
	/**
	 * The latest episode AniList says has aired, or `null` when none has, or
	 * when AniKoto does not carry the anime, so there is none to wait for.
	 */
	latestAiredEpisode: number | null;
	/** The latest episode AniKoto carries, or `null` when it carries none. */
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
 * Waits between checks for an episode that has aired but that AniKoto does
 * not carry yet. It usually has subs within hours, sometimes a day later;
 * the last delay repeats.
 */
const releaseRetryDelaysMs = [
	15 * minute,
	30 * minute,
	hour,
	2 * hour,
	4 * hour,
	8 * hour,
	12 * hour,
] as const;

/**
 * Checks for one episode stop after this many attempts, about three days
 * after it aired. The next broadcast starts a new round for the next episode.
 */
export const maximumReleaseAttempts = 11;

/** How often to check on premiere day when AniList has a date but no time. */
const premiereDayCheckIntervalMs = 20 * minute;

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
 * - a retry, when AniKoto does not carry an aired episode yet;
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
		state.latestAiredEpisode !== null &&
		(state.latestReleasedEpisode ?? 0) < state.latestAiredEpisode;
	const awaitedEpisode = behind ? state.latestAiredEpisode : null;
	const attempt =
		awaitedEpisode !== null && awaitedEpisode === progress.awaitedEpisode
			? progress.attempt + 1
			: 0;
	const retryAt =
		awaitedEpisode !== null && attempt < maximumReleaseAttempts
			? new Date(
					now.getTime() + releaseRetryDelaysMs[Math.min(attempt, releaseRetryDelaysMs.length - 1)]!,
				)
			: null;

	if (state.status === "FINISHED" || state.status === "CANCELLED") {
		return retryAt
			? {
					done: false,
					runAt: retryAt,
					awaitedEpisode,
					attempt,
				}
			: {
					done: true,
				};
	}

	const scheduledAt = nextScheduledCheck(state, now);
	return {
		done: false,
		runAt: retryAt && retryAt < scheduledAt ? retryAt : scheduledAt,
		awaitedEpisode,
		attempt,
	};
}

/** The next check that does not depend on a missing release. */
function nextScheduledCheck(state: AiringState, now: Date): Date {
	if (state.nextAiringAt) {
		// A broadcast time in the past means AniList has not caught up yet.
		return state.nextAiringAt > now
			? state.nextAiringAt
			: new Date(now.getTime() + premiereDayCheckIntervalMs);
	}

	const premiereDay = state.status === "NOT_YET_RELEASED" ? japanDay(state.startDate) : null;
	if (premiereDay && now < premiereDay.end) {
		return now < premiereDay.start
			? premiereDay.start
			: new Date(now.getTime() + premiereDayCheckIntervalMs);
	}

	return new Date(
		now.getTime() +
			(state.status === "HIATUS" ? hiatusCheckIntervalMs : unscheduledCheckIntervalMs),
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
		end: new Date(start + day),
	};
}

/**
 * Extends the latest aired episode AniList knows through the episodes
 * AnimeSchedule's timetable lists as released after it, such as the second
 * of a double-episode premiere.
 *
 * Only an unbroken run counts: the timetable numbers some long-running
 * shows differently from AniList (episode 555 where AniList and AniKoto
 * say 260 or 360), and a number far ahead would be waited on forever.
 *
 * @param latest - The latest aired episode AniList knows.
 * @param released - The episodes the timetable lists as released.
 */
export function extendThroughReleased(latest: number, released: readonly number[]) {
	const episodes = new Set(released);
	let through = latest;
	while (episodes.has(through + 1)) {
		through += 1;
	}
	return through;
}
