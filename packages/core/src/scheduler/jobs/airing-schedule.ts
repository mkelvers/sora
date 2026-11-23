import { day, hour, minute } from "@sora/shared";

import type { AiringState } from "./airing-plan";

/** When an anime is next due a check, apart from any missing release. */
export class AiringSchedule {
	/** How often to check on premiere day when AniList has a date but no time. */
	static readonly #premiereIntervalMs = 20 * minute;

	/** How often to ask AniList about an anime on hiatus. */
	static readonly #hiatusIntervalMs = 7 * day;

	/** How often to ask AniList about an airing anime with no announced episode. */
	static readonly #unscheduledIntervalMs = day;

	/** Japan Standard Time, which AniList's dates are in, is UTC+9. */
	static readonly #japanOffsetMs = 9 * hour;

	readonly #state: AiringState;
	readonly #now: Date;

	constructor(state: AiringState, now: Date) {
		this.#state = state;
		this.#now = now;
	}

	/** The next check that does not depend on a missing release. */
	get next(): Date {
		const state = this.#state;
		const now = this.#now;

		if (state.nextAt) {
			// A broadcast time in the past means AniList has not caught up yet.
			if (state.nextAt > now) {
				return state.nextAt;
			}

			return new Date(now.getTime() + AiringSchedule.#premiereIntervalMs);
		}

		const premiereDay = this.#premiereDay;

		if (premiereDay && now < premiereDay.end) {
			if (now < premiereDay.start) {
				return premiereDay.start;
			}

			return new Date(now.getTime() + AiringSchedule.#premiereIntervalMs);
		}

		let intervalMs = AiringSchedule.#unscheduledIntervalMs;

		if (state.status === "HIATUS") {
			intervalMs = AiringSchedule.#hiatusIntervalMs;
		}

		return new Date(now.getTime() + intervalMs);
	}

	/**
	 * The span of the premiere day in Japan, for an anime that has not
	 * premiered and has a `YYYY-MM-DD` start date; `null` otherwise.
	 */
	get #premiereDay() {
		const { startDate, status } = this.#state;

		if (status !== "NOT_YET_RELEASED" || !startDate) {
			return null;
		}

		const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(startDate);

		if (!match) {
			return null;
		}

		const start =
			Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) -
			AiringSchedule.#japanOffsetMs;

		return {
			end: new Date(start + day),
			start: new Date(start),
		};
	}
}
