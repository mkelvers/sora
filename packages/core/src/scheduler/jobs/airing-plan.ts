import { hour, minute, defined } from "@sora/shared";

import type { AnimeStatus } from "../../catalog/models/anime";
import { AiringSchedule } from "./airing-schedule";

/** What one airing check learned about an anime. */
export interface AiringState {
	status: AnimeStatus | null;
	/** When AniList expects the next episode, if it has announced one. */
	nextAt: Date | null;
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
const retryDelaysMs = [
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
export const planNextCheck = (
	state: AiringState,
	progress: AiringProgress,
	now: Date,
): AiringPlan => {
	const behind =
		state.latestAiredEpisode !== null &&
		(state.latestReleasedEpisode ?? 0) < state.latestAiredEpisode;

	let awaitedEpisode: number | null = null;
	let attempt = 0;
	let retryAt: Date | null = null;

	if (behind) {
		awaitedEpisode = state.latestAiredEpisode;
	}

	const isSameEpisode = awaitedEpisode !== null && awaitedEpisode === progress.awaitedEpisode;

	if (isSameEpisode) {
		attempt = progress.attempt + 1;
	}

	const isRetrying = awaitedEpisode !== null && attempt < maximumReleaseAttempts;

	if (isRetrying) {
		const delayMs = defined(retryDelaysMs[Math.min(attempt, retryDelaysMs.length - 1)]);
		retryAt = new Date(now.getTime() + delayMs);
	}

	if (state.status === "FINISHED" || state.status === "CANCELLED") {
		if (retryAt) {
			return {
				attempt,
				awaitedEpisode,
				done: false,
				runAt: retryAt,
			};
		}

		return {
			done: true,
		};
	}

	let runAt = new AiringSchedule(state, now).next;

	if (retryAt && retryAt < runAt) {
		runAt = retryAt;
	}

	return {
		attempt,
		awaitedEpisode,
		done: false,
		runAt,
	};
};

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
export const extendThroughReleased = (latest: number, released: readonly number[]) => {
	const episodes = new Set(released);
	let through = latest;

	while (episodes.has(through + 1)) {
		through += 1;
	}

	return through;
};
