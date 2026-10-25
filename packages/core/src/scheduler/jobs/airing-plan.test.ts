import { describe, expect, test } from "bun:test";

import { hour, minute } from "@sora/shared";

import { extendThroughReleased, maximumReleaseAttempts, planNextCheck } from "./airing-plan";
import type { AiringState } from "./airing-plan";

const now = new Date("2026-09-23T12:00:00Z");

const state = (overrides: Partial<AiringState>): AiringState => ({
	latestAiredEpisode: null,
	latestReleasedEpisode: null,
	nextAiringAt: null,
	startDate: null,
	status: "RELEASING",
	...overrides,
});

const fresh = {
	attempt: 0,
	awaitedEpisode: null,
};

describe("planNextCheck", () => {
	test("checks at the next broadcast when every aired episode is released", () => {
		const nextAiringAt = new Date("2026-09-25T08:00:00Z");
		const plan = planNextCheck(
			state({
				latestAiredEpisode: 5,
				latestReleasedEpisode: 5,
				nextAiringAt,
			}),
			fresh,
			now,
		);

		expect(plan).toEqual({
			attempt: 0,
			awaitedEpisode: null,
			done: false,
			runAt: nextAiringAt,
		});
	});

	test("retries soon after a broadcast when AniKoto does not carry the episode yet", () => {
		const plan = planNextCheck(
			state({
				latestAiredEpisode: 6,
				latestReleasedEpisode: 5,
				nextAiringAt: new Date("2026-09-30T08:00:00Z"),
			}),
			fresh,
			now,
		);

		expect(plan).toEqual({
			attempt: 0,
			awaitedEpisode: 6,
			done: false,
			runAt: new Date(now.getTime() + 15 * minute),
		});
	});

	test("backs off while the same episode stays missing", () => {
		const plan = planNextCheck(
			state({
				latestAiredEpisode: 6,
				latestReleasedEpisode: 5,
				nextAiringAt: new Date("2026-09-30T08:00:00Z"),
			}),
			{
				attempt: 2,
				awaitedEpisode: 6,
			},
			now,
		);

		expect(plan).toMatchObject({
			attempt: 3,
			runAt: new Date(now.getTime() + 2 * hour),
		});
	});

	test("stops retrying an episode after the last attempt but keeps the broadcast check", () => {
		const nextAiringAt = new Date("2026-09-30T08:00:00Z");
		const plan = planNextCheck(
			state({
				latestAiredEpisode: 6,
				latestReleasedEpisode: 5,
				nextAiringAt,
			}),
			{
				attempt: maximumReleaseAttempts - 1,
				awaitedEpisode: 6,
			},
			now,
		);

		expect(plan).toMatchObject({
			runAt: nextAiringAt,
		});
	});

	test("ends once a finished anime has every episode", () => {
		const plan = planNextCheck(
			state({
				latestAiredEpisode: 12,
				latestReleasedEpisode: 12,
				status: "FINISHED",
			}),
			fresh,
			now,
		);

		expect(plan).toEqual({
			done: true,
		});
	});

	test("keeps waiting for the final episode of a finished anime, then gives up", () => {
		const finale = state({
			latestAiredEpisode: 12,
			latestReleasedEpisode: 11,
			status: "FINISHED",
		});

		expect(planNextCheck(finale, fresh, now)).toMatchObject({
			awaitedEpisode: 12,
			done: false,
		});
		expect(
			planNextCheck(
				finale,
				{
					attempt: maximumReleaseAttempts - 1,
					awaitedEpisode: 12,
				},
				now,
			),
		).toEqual({
			done: true,
		});
	});

	test("waits for premiere day, in Japan time, when AniList has a date but no time", () => {
		const plan = planNextCheck(
			state({
				startDate: "2026-10-05",
				status: "NOT_YET_RELEASED",
			}),
			fresh,
			now,
		);

		expect(plan).toMatchObject({
			runAt: new Date("2026-10-04T15:00:00Z"),
		});
	});

	test("checks every 20 minutes during premiere day", () => {
		const duringPremiere = new Date("2026-10-05T03:00:00Z");
		const plan = planNextCheck(
			state({
				startDate: "2026-10-05",
				status: "NOT_YET_RELEASED",
			}),
			fresh,
			duringPremiere,
		);

		expect(plan).toMatchObject({
			runAt: new Date(duringPremiere.getTime() + 20 * minute),
		});
	});

	test("uses the announced premiere time over the premiere-day window", () => {
		// Psyren: AniList lists episode 1 for 2026-10-05 23:00 JST.
		const nextAiringAt = new Date(1_791_208_800_000);
		const plan = planNextCheck(
			state({
				nextAiringAt,
				startDate: "2026-10-05",
				status: "NOT_YET_RELEASED",
			}),
			fresh,
			now,
		);

		expect(plan).toMatchObject({
			runAt: nextAiringAt,
		});
	});

	test("checks daily when an upcoming anime only has a month", () => {
		const plan = planNextCheck(
			state({
				startDate: "2027-01",
				status: "NOT_YET_RELEASED",
			}),
			fresh,
			now,
		);

		expect(plan).toMatchObject({
			runAt: new Date("2026-09-24T12:00:00Z"),
		});
	});

	test("checks again shortly when AniList's broadcast time has already passed", () => {
		const plan = planNextCheck(
			state({
				latestAiredEpisode: 4,
				latestReleasedEpisode: 4,
				nextAiringAt: new Date(now.getTime() - minute),
			}),
			fresh,
			now,
		);

		expect(plan).toMatchObject({
			runAt: new Date(now.getTime() + 20 * minute),
		});
	});
});

describe("extendThroughReleased", () => {
	test("includes the second episode of a double premiere AniList lists later", () => {
		expect(extendThroughReleased(1, [2])).toBe(2);
	});

	test("includes every episode released together", () => {
		expect(extendThroughReleased(1, [4, 2, 3])).toBe(4);
	});

	test("keeps AniList's episode when the timetable lists nothing after it", () => {
		expect(extendThroughReleased(5, [])).toBe(5);
	});

	test("ignores a timetable number far ahead of AniList's, which would never arrive", () => {
		expect(extendThroughReleased(260, [555])).toBe(260);
	});

	test("stops at the first gap", () => {
		expect(extendThroughReleased(1, [2, 4])).toBe(2);
	});
});

describe("a double-episode premiere", () => {
	const premiere = new Date("2026-10-03T13:20:00Z");

	test("keeps waiting for the second episode once AniKoto carries the first", () => {
		const plan = planNextCheck(
			state({
				latestAiredEpisode: extendThroughReleased(1, [2]),
				latestReleasedEpisode: 1,
				nextAiringAt: new Date("2026-10-03T15:14:00Z"),
			}),
			{
				attempt: 0,
				awaitedEpisode: 2,
			},
			premiere,
		);

		expect(plan).toMatchObject({
			attempt: 1,
			awaitedEpisode: 2,
			runAt: new Date(premiere.getTime() + 30 * minute),
		});
	});
});
