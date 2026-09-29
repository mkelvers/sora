import { describe, expect, mock, test } from "bun:test";

mock.module("../../database/client", () => ({
	db: {},
}));

const { planReleases } = await import("./releases");

const now = new Date("2026-09-29T03:00:00Z");

/** Episodes `from` to `to` of AniList entry `anilistId` in `seriesId`, listed and playable. */
function listed(seriesId: string, anilistId: number, from: number, to: number) {
	return Array.from(
		{
			length: to - from + 1,
		},
		(_, index) => ({
			seriesId,
			anilistId,
			anilistEpisode: from + index,
		}),
	);
}

describe("planReleases", () => {
	test("starts watching a series seen for the first time, and records what it lists as no news", () => {
		const plan = planReleases(["slime"], listed("slime", 101, 1, 3), new Set(), new Set(), now);

		expect(plan.watch).toEqual(["slime"]);
		expect(plan.releases).toHaveLength(3);
		expect(plan.releases.every((release) => !release.news)).toBe(true);
	});

	test("records a new episode of a watched series as news, at when it was seen", () => {
		const plan = planReleases(
			["slime"],
			listed("slime", 101, 1, 4),
			new Set(["slime"]),
			new Set(["101:1", "101:2", "101:3"]),
			now,
		);

		expect(plan.watch).toEqual([]);
		expect(plan.releases).toEqual([
			{
				anilistId: 101,
				anilistEpisode: 4,
				releasedAt: now,
				news: true,
			},
		]);
	});

	test("records every episode of a newly listed season as news", () => {
		const plan = planReleases(
			["demon-slayer"],
			[...listed("demon-slayer", 201, 1, 2), ...listed("demon-slayer", 202, 1, 1)],
			new Set(["demon-slayer"]),
			new Set(["201:1", "201:2"]),
			now,
		);

		expect(plan.releases.map((release) => [release.anilistId, release.news])).toEqual([
			[202, true],
		]);
	});

	test("records nothing when nothing new is listed", () => {
		const plan = planReleases(
			["slime"],
			listed("slime", 101, 1, 2),
			new Set(["slime"]),
			new Set(["101:1", "101:2"]),
			now,
		);

		expect(plan).toEqual({
			watch: [],
			releases: [],
		});
	});

	test("does not record an episode twice when two series list it", () => {
		const plan = planReleases(
			["a", "b"],
			[...listed("a", 301, 1, 1), ...listed("b", 301, 1, 1)],
			new Set(["a", "b"]),
			new Set(),
			now,
		);

		expect(plan.releases).toHaveLength(1);
	});

	test("keeps watched and fresh series apart in one run", () => {
		const plan = planReleases(
			["watched", "fresh"],
			[...listed("watched", 401, 1, 1), ...listed("fresh", 402, 1, 1)],
			new Set(["watched"]),
			new Set(),
			now,
		);

		expect(plan.watch).toEqual(["fresh"]);
		expect(plan.releases.map((release) => [release.anilistId, release.news])).toEqual([
			[401, true],
			[402, false],
		]);
	});

	test("does not record again an episode that dropped out and came back", () => {
		const plan = planReleases(
			["slime"],
			listed("slime", 101, 5, 5),
			new Set(["slime"]),
			new Set(["101:5"]),
			now,
		);

		expect(plan.releases).toEqual([]);
	});
});
