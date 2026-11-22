import { describe, expect, test } from "bun:test";

import { day } from "@sora/shared";

import {
	activityOf,
	arrange,
	featuredCount,
	hasNews,
	isCurrent,
	minimumCount,
	order,
	reasonsOf,
	rotationOf,
	rotationPeriod,
	shuffle,
} from "./rotation";
import type { Candidate } from "./rotation";

const now = new Date("2026-10-05T12:00:00Z");

const ids = (prefix: string, count: number) =>
	Array.from(
		{
			length: count,
		},
		(_, index) => `${prefix}${index}`,
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

describe("rotationOf", () => {
	const start = new Date("2026-09-28T06:00:00Z");

	test("starts a rotation every day at 06:00 UTC", () => {
		expect(rotationOf(new Date(start.getTime() - 1))).toBe(rotationOf(start) - 1);
	});

	test("keeps it all day", () => {
		expect(rotationOf(new Date(start.getTime() + rotationPeriod - 1))).toBe(rotationOf(start));
		expect(rotationOf(new Date(start.getTime() + rotationPeriod))).toBe(rotationOf(start) + 1);
	});
});

const ago = (ms: number) => new Date(now.getTime() - ms);

const quiet = {
	past: null,
	recent: null,
};

const candidate = (overrides: Partial<Candidate>): Candidate => ({
	activity: quiet,
	id: "c",
	lastAiredAt: null,
	lastPickedAt: null,
	startDate: "2026-01-01",
	status: "FINISHED",
	...overrides,
});

const daysOf = (from: number, to: number, trending: number) =>
	Array.from(
		{
			length: from - to,
		},
		(_, index) => ({
			day: ago((to + index) * day)
				.toISOString()
				.slice(0, 10),
			trending,
		}),
	);

const idsOf = (list: readonly Candidate[]) => list.map(({ id }) => id);

const all = () => true;

describe("activityOf", () => {
	test("averages the last week and a week a month ago", () => {
		expect(activityOf([...daysOf(7, 0, 600), ...daysOf(35, 28, 1200)], now)).toEqual({
			past: 1200,
			recent: 600,
		});
	});

	test("trusts neither window with too few days", () => {
		expect(activityOf(daysOf(2, 0, 600), now)).toEqual(quiet);
	});
});

describe("reasonsOf", () => {
	test("features a title that is airing", () => {
		expect(
			reasonsOf(
				candidate({
					status: "RELEASING",
				}),
				now,
			),
		).toEqual(["airing"]);
	});

	test("features a season that ended in the last four weeks", () => {
		expect(
			reasonsOf(
				candidate({
					lastAiredAt: ago(20 * day),
				}),
				now,
			),
		).toEqual(["fresh"]);
	});

	test("features a film that just came out", () => {
		expect(
			reasonsOf(
				candidate({
					startDate: ago(10 * day)
						.toISOString()
						.slice(0, 10),
				}),
				now,
			),
		).toEqual(["fresh"]);
	});

	test("leaves out a season past its moment that people talk about less", () => {
		expect(
			reasonsOf(
				candidate({
					activity: {
						past: 1224,
						recent: 589,
					},
					lastAiredAt: ago(120 * day),
				}),
				now,
			),
		).toEqual([]);
	});

	test("features an older season people are coming back to", () => {
		expect(
			reasonsOf(
				candidate({
					activity: {
						past: 300,
						recent: 900,
					},
					lastAiredAt: ago(120 * day),
				}),
				now,
			),
		).toEqual(["rising"]);
	});

	test("does not count a little-known title as rising", () => {
		expect(
			reasonsOf(
				candidate({
					activity: {
						past: 20,
						recent: 80,
					},
					lastAiredAt: ago(120 * day),
				}),
				now,
			),
		).toEqual([]);
	});
});

describe("hasNews", () => {
	test("counts an episode aired since the title was last featured", () => {
		expect(
			hasNews(
				candidate({
					lastAiredAt: ago(day),
					lastPickedAt: ago(5 * day),
					status: "RELEASING",
				}),
				now,
			),
		).toBe(true);
	});

	test("counts nothing when no episode aired since", () => {
		expect(
			hasNews(
				candidate({
					lastAiredAt: ago(9 * day),
					lastPickedAt: ago(5 * day),
				}),
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
				candidate({
					activity: rising,
					lastPickedAt: ago(3 * day),
				}),
				now,
			),
		).toBe(false);
		expect(
			hasNews(
				candidate({
					activity: rising,
					lastPickedAt: ago(8 * day),
				}),
				now,
			),
		).toBe(true);
	});
});

describe("shuffle", () => {
	const candidates = ids("c", 20).map((id) =>
		candidate({
			id,
		}),
	);

	test("is stable for one profile and rotation", () => {
		expect(idsOf(shuffle(candidates, "profile", 100))).toEqual(
			idsOf(shuffle(candidates, "profile", 100)),
		);
	});

	test("shuffles each rotation anew", () => {
		expect(idsOf(shuffle(candidates, "profile", 100))).not.toEqual(
			idsOf(shuffle(candidates, "profile", 101)),
		);
	});

	test("orders each profile differently", () => {
		expect(idsOf(shuffle(candidates, "one", 100))).not.toEqual(
			idsOf(shuffle(candidates, "two", 100)),
		);
	});

	test("puts a much-talked-about title first more often", () => {
		const hot = candidate({
			activity: {
				past: null,
				recent: 2000,
			},
			id: "hot",
		});

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
				candidate({
					id: "past",
					lastAiredAt: ago(120 * day),
				}),
				candidate({
					id: "new",
					lastAiredAt: ago(day),
					lastPickedAt: ago(3 * day),
					status: "RELEASING",
				}),
				candidate({
					id: "same",
					lastAiredAt: ago(4 * day),
					lastPickedAt: ago(3 * day),
					status: "RELEASING",
				}),
				candidate({
					id: "older",
					lastAiredAt: ago(6 * day),
					lastPickedAt: ago(5 * day),
					status: "RELEASING",
				}),
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
					news: ids("c", 9),
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
					news: ids("c", 20),
					repeats: ids("r", 5),
				},
				all,
			),
		).toHaveLength(featuredCount);
	});

	test("repeats titles only to reach the minimum", () => {
		expect(
			arrange(
				{
					news: ["c0"],
					repeats: ids("r", 5),
				},
				all,
			),
		).toEqual(["c0", ...ids("r", minimumCount - 1)]);
	});

	test("counts titles already featured this rotation", () => {
		expect(
			arrange(
				{
					news: ids("c", 9),
					repeats: ids("r", 5),
				},
				all,
				4,
			),
		).toEqual(["c0", "c1"]);
		expect(
			arrange(
				{
					news: [],
					repeats: ids("r", 5),
				},
				all,
				2,
			),
		).toEqual(["r0"]);
	});
});
