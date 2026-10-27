import { describe, expect, test } from "bun:test";

import { arrange, featuredCount, isCurrent, rotate, rotationOf, rotationPeriod } from "./rotation";

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
		expect(isCurrent({ ...entry, popularity: 165_000, score: 67 }, now)).toBe(false);
		expect(isCurrent({ ...entry, popularity: 20_000, score: 80 }, now)).toBe(false);
	});
});

describe("rotationOf", () => {
	const day = new Date("2026-09-28T06:00:00Z");

	test("starts a rotation every day at 06:00 UTC", () => {
		expect(rotationOf(new Date(day.getTime() - 1))).toBe(rotationOf(day) - 1);
	});

	test("keeps it all day", () => {
		expect(rotationOf(new Date(day.getTime() + rotationPeriod - 1))).toBe(rotationOf(day));
		expect(rotationOf(new Date(day.getTime() + rotationPeriod))).toBe(rotationOf(day) + 1);
	});
});

describe("rotate", () => {
	const candidates = ids("c", 20);

	test("is stable for one profile and rotation", () => {
		expect(rotate(candidates, "profile", 100)).toEqual(rotate(candidates, "profile", 100));
	});

	test("shuffles each rotation anew", () => {
		expect(rotate(candidates, "profile", 100)).not.toEqual(rotate(candidates, "profile", 101));
	});

	test("orders each profile differently", () => {
		expect(rotate(candidates, "one", 100)).not.toEqual(rotate(candidates, "two", 100));
	});

	test("keeps every candidate", () => {
		expect(rotate(candidates, "profile", 100).toSorted()).toEqual(candidates.toSorted());
	});
});

describe("arrange", () => {
	test("skips unusable titles", () => {
		expect(arrange(ids("c", 9), (id) => id !== "c1")).toEqual(["c0", "c2", "c3", "c4", "c5", "c6"]);
	});

	test("never places more than the carousel holds", () => {
		expect(arrange(ids("c", 20), () => true)).toHaveLength(featuredCount);
	});

	test("places fewer when too few are usable", () => {
		expect(arrange(ids("c", 3), () => true)).toHaveLength(3);
	});
});
