import { describe, expect, test } from "bun:test";

import { day } from "@sora/shared";

import {
	activityOf,
	arrange,
	maximumCount,
	hasNews,
	isCurrent,
	minimumCount,
	order,
	reasonsOf,
	numberOf,
	period,
	shuffle,
} from "./rotation";
import type { Candidate } from "./rotation";

const now = new Date("2026-10-05T12:00:00Z");

/** Titles with something new, `c0` to `c19`. */
const newIds = Array.from(
	{
		length: 20,
	},
	(_, index) => `c${index}`,
);

/** Titles featured before with nothing new, `r0` to `r4`. */
const repeatIds = Array.from(
	{
		length: 5,
	},
	(_, index) => `r${index}`,
);

describe("isCurrent", () => {
	test("accepts a well-liked, popular season that started recently", () => {
		expect(
			isCurrent(
				{
					popularity: 167_000,
					score: 86,
					startDate: "2026-07-04",
					status: "FINISHED",
				},
				now,
			),
		).toBe(true);
	});

	test("accepts a title that is still airing", () => {
		expect(
			isCurrent(
				{
					popularity: 90_000,
					score: 80,
					startDate: "2026-02-01",
					status: "RELEASING",
				},
				now,
			),
		).toBe(true);
	});

	test("rejects an old favourite that is not airing", () => {
		expect(
			isCurrent(
				{
					popularity: 900_000,
					score: 90,
					startDate: "2013-04-07",
					status: "FINISHED",
				},
				now,
			),
		).toBe(false);
	});

	test("rejects a season that ended long ago", () => {
		expect(
			isCurrent(
				{
					popularity: 260_000,
					score: 86,
					startDate: "2025-06-09",
					status: "FINISHED",
				},
				now,
			),
		).toBe(false);
	});

	test("rejects a new title that is poorly liked or little known", () => {
		const entry = {
			startDate: "2026-07-03",
			status: "RELEASING",
		};

		expect(
			isCurrent(
				{
					...entry,
					popularity: 165_000,
					score: 67,
				},
				now,
			),
		).toBe(false);
		expect(
			isCurrent(
				{
					...entry,
					popularity: 5000,
					score: 80,
				},
				now,
			),
		).toBe(false);
	});

	test("asks fewer listings of a title still airing than of a finished one", () => {
		expect(
			isCurrent(
				{
					popularity: 15_000,
					score: 80,
					startDate: "2026-10-01",
					status: "RELEASING",
				},
				now,
			),
		).toBe(true);
		expect(
			isCurrent(
				{
					popularity: 15_000,
					score: 80,
					startDate: "2026-07-01",
					status: "FINISHED",
				},
				now,
			),
		).toBe(false);
	});
});

describe("numberOf", () => {
	const start = new Date("2026-09-28T06:00:00Z");

	test("starts a rotation every day at 06:00 UTC", () => {
		expect(numberOf(new Date(start.getTime() - 1))).toBe(numberOf(start) - 1);
	});

	test("keeps it all day", () => {
		expect(numberOf(new Date(start.getTime() + period - 1))).toBe(numberOf(start));
		expect(numberOf(new Date(start.getTime() + period))).toBe(numberOf(start) + 1);
	});
});

/** Times and activity counted back from {@link now}. */
class Past {
	readonly #now: Date;

	constructor(time: Date) {
		this.#now = time;
	}

	/** The time `ms` before now. */
	ago(ms: number) {
		return new Date(this.#now.getTime() - ms);
	}

	/** A day of `trending` activity for each day from `from` days ago up to `to` days ago. */
	days(from: number, to: number, trending: number) {
		return Array.from(
			{
				length: from - to,
			},
			(_, index) => ({
				day: this.ago((to + index) * day)
					.toISOString()
					.slice(0, 10),
				trending,
			}),
		);
	}
}

const past = new Past(now);

const quiet = {
	past: null,
	recent: null,
};

const base: Candidate = {
	activity: quiet,
	id: "c",
	lastAiredAt: null,
	lastPickedAt: null,
	startDate: "2026-01-01",
	status: "FINISHED",
};

describe("activityOf", () => {
	test("averages the last week and a week a month ago", () => {
		expect(activityOf([...past.days(7, 0, 600), ...past.days(35, 28, 1200)], now)).toEqual({
			past: 1200,
			recent: 600,
		});
	});

	test("trusts neither window with too few days", () => {
		expect(activityOf(past.days(2, 0, 600), now)).toEqual(quiet);
	});
});

describe("reasonsOf", () => {
	test("features a title that is airing", () => {
		expect(
			reasonsOf(
				{
					...base,
					status: "RELEASING",
				},
				now,
			),
		).toEqual(["airing"]);
	});

	test("features a season that ended in the last four weeks", () => {
		expect(
			reasonsOf(
				{
					...base,
					lastAiredAt: past.ago(20 * day),
				},
				now,
			),
		).toEqual(["fresh"]);
	});

	test("features a film that just came out", () => {
		expect(
			reasonsOf(
				{
					...base,
					startDate: past
						.ago(10 * day)
						.toISOString()
						.slice(0, 10),
				},
				now,
			),
		).toEqual(["fresh"]);
	});

	test("leaves out a season past its moment that people talk about less", () => {
		expect(
			reasonsOf(
				{
					...base,
					activity: {
						past: 1224,
						recent: 589,
					},
					lastAiredAt: past.ago(120 * day),
				},
				now,
			),
		).toEqual([]);
	});

	test("features an older season people are coming back to", () => {
		expect(
			reasonsOf(
				{
					...base,
					activity: {
						past: 300,
						recent: 900,
					},
					lastAiredAt: past.ago(120 * day),
				},
				now,
			),
		).toEqual(["rising"]);
	});

	test("does not count a little-known title as rising", () => {
		expect(
			reasonsOf(
				{
					...base,
					activity: {
						past: 20,
						recent: 80,
					},
					lastAiredAt: past.ago(120 * day),
				},
				now,
			),
		).toEqual([]);
	});
});

describe("hasNews", () => {
	test("counts an episode aired since the title was last featured", () => {
		expect(
			hasNews(
				{
					...base,
					lastAiredAt: past.ago(day),
					lastPickedAt: past.ago(5 * day),
					status: "RELEASING",
				},
				now,
			),
		).toBe(true);
	});

	test("counts nothing when no episode aired since", () => {
		expect(
			hasNews(
				{
					...base,
					lastAiredAt: past.ago(9 * day),
					lastPickedAt: past.ago(5 * day),
				},
				now,
			),
		).toBe(false);
	});

	test("brings back a rising title a week after it was featured", () => {
		const rising = {
			past: 300,
			recent: 900,
		};

		expect(
			hasNews(
				{
					...base,
					activity: rising,
					lastPickedAt: past.ago(3 * day),
				},
				now,
			),
		).toBe(false);
		expect(
			hasNews(
				{
					...base,
					activity: rising,
					lastPickedAt: past.ago(8 * day),
				},
				now,
			),
		).toBe(true);
	});
});

describe("shuffle", () => {
	const candidates = newIds.map((id) => ({
		...base,
		id,
	}));

	test("is stable for one profile and rotation", () => {
		expect(shuffle(candidates, "profile", 100).map(({ id }) => id)).toEqual(
			shuffle(candidates, "profile", 100).map(({ id }) => id),
		);
	});

	test("shuffles each rotation anew", () => {
		expect(shuffle(candidates, "profile", 100).map(({ id }) => id)).not.toEqual(
			shuffle(candidates, "profile", 101).map(({ id }) => id),
		);
	});

	test("orders each profile differently", () => {
		expect(shuffle(candidates, "one", 100).map(({ id }) => id)).not.toEqual(
			shuffle(candidates, "two", 100).map(({ id }) => id),
		);
	});

	test("puts a much-talked-about title first more often", () => {
		const hot = {
			...base,
			activity: {
				past: null,
				recent: 2000,
			},
			id: "hot",
		};

		const rotations = Array.from(
			{
				length: 200,
			},
			(_, rotation) => shuffle([hot, ...candidates.slice(0, 5)], "profile", rotation),
		);

		const first = rotations.filter((list) => list[0]?.id === "hot").length;
		expect(first).toBeGreaterThan(100);
	});
});

describe("order", () => {
	test("leaves out titles without a reason and keeps repeats for last", () => {
		const { news, repeats } = order(
			[
				{
					...base,
					id: "past",
					lastAiredAt: past.ago(120 * day),
				},
				{
					...base,
					id: "new",
					lastAiredAt: past.ago(day),
					lastPickedAt: past.ago(3 * day),
					status: "RELEASING",
				},
				{
					...base,
					id: "same",
					lastAiredAt: past.ago(4 * day),
					lastPickedAt: past.ago(3 * day),
					status: "RELEASING",
				},
				{
					...base,
					id: "older",
					lastAiredAt: past.ago(6 * day),
					lastPickedAt: past.ago(5 * day),
					status: "RELEASING",
				},
			],
			"profile",
			100,
			now,
		);

		expect(news).toEqual(["new"]);
		expect(repeats).toEqual(["older", "same"]);
	});
});

describe("arrange", () => {
	test("skips unusable titles", () => {
		expect(
			arrange(
				{
					news: newIds.slice(0, 9),
					repeats: [],
				},
				(id) => id !== "c1",
			),
		).toEqual(["c0", "c2", "c3", "c4", "c5", "c6"]);
	});

	test("never places more than the carousel holds", () => {
		expect(
			arrange(
				{
					news: newIds,
					repeats: repeatIds,
				},
				() => true,
			),
		).toHaveLength(maximumCount);
	});

	test("repeats titles only to reach the minimum", () => {
		expect(
			arrange(
				{
					news: ["c0"],
					repeats: repeatIds,
				},
				() => true,
			),
		).toEqual(["c0", ...repeatIds.slice(0, minimumCount - 1)]);
	});

	test("counts titles already featured this rotation", () => {
		expect(
			arrange(
				{
					news: newIds.slice(0, 9),
					repeats: repeatIds,
				},
				() => true,
				4,
			),
		).toEqual(["c0", "c1"]);
		expect(
			arrange(
				{
					news: [],
					repeats: repeatIds,
				},
				() => true,
				2,
			),
		).toEqual(["r0"]);
	});
});
