import { describe, expect, test } from "bun:test";

import { favoriteGenres, rankCandidates, tasteOf, titleWeight } from "./taste";

const now = new Date("2026-09-26T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe("titleWeight", () => {
	test("counts a finished title more than one only planned", () => {
		const completed = titleWeight(
			{
				status: "completed",
				episodesPlayed: 24,
				lastActiveAt: now,
			},
			now,
		);
		const planned = titleWeight(
			{
				status: "planning",
				episodesPlayed: 0,
				lastActiveAt: now,
			},
			now,
		);
		expect(completed).toBeGreaterThan(planned);
		expect(planned).toBeGreaterThan(0);
	});

	test("halves after the half-life, but never fades below a quarter", () => {
		const fresh = titleWeight(
			{
				status: null,
				episodesPlayed: 3,
				lastActiveAt: now,
			},
			now,
		);
		expect(
			titleWeight(
				{
					status: null,
					episodesPlayed: 3,
					lastActiveAt: daysAgo(180),
				},
				now,
			),
		).toBeCloseTo(fresh / 2);
		expect(
			titleWeight(
				{
					status: null,
					episodesPlayed: 3,
					lastActiveAt: daysAgo(5000),
				},
				now,
			),
		).toBeCloseTo(fresh / 4);
	});

	test("counts a dropped title against taste", () => {
		expect(
			titleWeight(
				{
					status: "dropped",
					episodesPlayed: 12,
					lastActiveAt: now,
				},
				now,
			),
		).toBeLessThan(0);
	});
});

describe("rankCandidates", () => {
	const candidate = (
		anilistId: number,
		genres: string[],
		popularity = 200_000,
		averageScore = 80,
	) => ({
		anilistId,
		genres,
		popularity,
		averageScore,
	});

	test("puts titles users recommend before titles that only share genres", () => {
		const taste = tasteOf([
			{
				weight: 2,
				genres: ["Action", "Fantasy"],
				recommended: [1],
			},
		]);
		const ranked = rankCandidates(taste, [
			candidate(2, ["Action", "Fantasy"]),
			candidate(1, ["Action", "Fantasy"]),
		]);
		expect(ranked.map((entry) => entry.anilistId)).toEqual([1, 2]);
	});

	test("prefers closer genres, and leaves out titles that share none", () => {
		const taste = tasteOf([
			{
				weight: 1,
				genres: ["Action", "Fantasy"],
				recommended: [],
			},
		]);
		const ranked = rankCandidates(taste, [
			candidate(1, ["Romance"]),
			candidate(2, ["Action", "Romance", "Drama", "Slice of Life"]),
			candidate(3, ["Action", "Fantasy"]),
		]);
		expect(ranked.map((entry) => entry.anilistId)).toEqual([3, 2]);
	});

	test("lets dropped titles pull their genres down", () => {
		const taste = tasteOf([
			{
				weight: 1,
				genres: ["Action"],
				recommended: [],
			},
			{
				weight: 1,
				genres: ["Sports"],
				recommended: [],
			},
			{
				weight: -1.5,
				genres: ["Sports"],
				recommended: [],
			},
		]);
		expect(favoriteGenres(taste, 3)).toEqual(["Action"]);
	});
});
