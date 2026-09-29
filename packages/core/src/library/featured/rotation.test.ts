import { describe, expect, test } from "bun:test";

import { arrange, featuredPattern, rotate, rotationPeriod, rotationOf, shelfOf } from "./rotation";

const now = new Date("2026-09-29T12:00:00Z");
const ids = (prefix: string, count: number) =>
	Array.from(
		{
			length: count,
		},
		(_, index) => `${prefix}${index}`,
	);

describe("shelfOf", () => {
	test("puts a well-liked season from the last year on fresh", () => {
		expect(
			shelfOf(
				[
					{
						startDate: "2021-06-17",
						score: 67,
						popularity: 132_000,
					},
					{
						startDate: "2025-12-10",
						score: 77,
						popularity: 28_000,
					},
				],
				now,
			),
		).toBe("fresh");
	});

	test("leaves out a new title that is poorly liked", () => {
		expect(
			shelfOf(
				[
					{
						startDate: "2026-07-03",
						score: 67,
						popularity: 65_000,
					},
				],
				now,
			),
		).toBeNull();
	});

	test("puts an older, highly rated title on acclaimed before popular", () => {
		expect(
			shelfOf(
				[
					{
						startDate: "2009-04-05",
						score: 90,
						popularity: 900_000,
					},
				],
				now,
			),
		).toBe("acclaimed");
	});

	test("puts an older, well-liked hit on popular", () => {
		expect(
			shelfOf(
				[
					{
						startDate: "2019-04-06",
						score: 80,
						popularity: 400_000,
					},
				],
				now,
			),
		).toBe("popular");
	});
});

describe("rotationOf", () => {
	const monday = new Date("2026-09-28T06:00:00Z");

	test("starts a rotation on Monday at 06:00 UTC", () => {
		expect(rotationOf(new Date(monday.getTime() - 1))).toBe(rotationOf(monday) - 1);
	});

	test("keeps it all week", () => {
		expect(rotationOf(new Date(monday.getTime() + rotationPeriod - 1))).toBe(rotationOf(monday));
		expect(rotationOf(new Date(monday.getTime() + rotationPeriod))).toBe(rotationOf(monday) + 1);
	});
});

describe("rotate", () => {
	const shelves = {
		fresh: ids("f", 40),
		acclaimed: ids("a", 30),
		popular: ids("p", 20),
	};

	test("shuffles each rotation anew", () => {
		expect(rotate(shelves, "profile", 100)).not.toEqual(rotate(shelves, "profile", 101));
	});

	test("orders each profile differently", () => {
		expect(rotate(shelves, "one", 100)).not.toEqual(rotate(shelves, "two", 100));
	});

	test("keeps a few candidates per place", () => {
		const candidates = rotate(shelves, "profile", 100);
		expect(candidates.fresh).toHaveLength(9);
		expect(candidates.acclaimed).toHaveLength(6);
		expect(candidates.popular).toHaveLength(3);
	});

	test("keeps every candidate of a small shelf", () => {
		const small = rotate(
			{
				fresh: ["x", "y"],
				acclaimed: [],
				popular: [],
			},
			"profile",
			100,
		);
		expect(small.fresh.toSorted()).toEqual(["x", "y"]);
		expect(small.acclaimed).toEqual([]);
	});
});

describe("arrange", () => {
	test("fills the pattern from each shelf in order, skipping unusable titles", () => {
		expect(
			arrange(
				{
					fresh: ["f0", "f1", "f2", "f3"],
					acclaimed: ["a0", "a1"],
					popular: ["p0"],
				},
				(id) => id !== "f1",
			),
		).toEqual(["f0", "a0", "f2", "p0", "f3", "a1"]);
	});

	test("fills a place whose shelf ran out from another", () => {
		const picked = arrange(
			{
				fresh: ["f0", "f1", "f2", "f3", "f4"],
				acclaimed: [],
				popular: [],
			},
			() => true,
		);
		expect(picked).toEqual(["f0", "f1", "f2", "f3", "f4"]);
	});

	test("never places more than the pattern holds", () => {
		expect(
			arrange(
				{
					fresh: ids("f", 9),
					acclaimed: ids("a", 6),
					popular: ids("p", 3),
				},
				() => true,
			),
		).toHaveLength(featuredPattern.length);
	});
});
