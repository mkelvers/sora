import { describe, expect, test } from "bun:test";

import type { PlayableSeason } from "../../series/queries";
import { nextEpisode } from "./next";

function season(id: string, overrides: Partial<PlayableSeason> = {}): PlayableSeason {
	return {
		id,
		kind: "season",
		number: 1,
		title: id,
		inWatchOrder: true,
		airing: false,
		episodes: [1, 2],
		releasedAt: new Date("2020-01-01T00:00:00Z"),
		...overrides,
	};
}

function last(seasonId: string, episode: number, at: string, finished = true) {
	return {
		seasonId,
		episode,
		finished,
		at: new Date(at),
	};
}

describe("nextEpisode", () => {
	test("is the episode itself while it is unfinished", () => {
		expect(nextEpisode([season("s1")], last("s1", 1, "2026-01-01T00:00:00Z", false))).toEqual({
			next: {
				seasonId: "s1",
				episode: 1,
			},
			offered: null,
		});
	});

	test("goes on within a season", () => {
		expect(nextEpisode([season("s1")], last("s1", 1, "2026-01-01T00:00:00Z"))?.next).toEqual({
			seasonId: "s1",
			episode: 2,
		});
	});

	test("goes on into a season that was out when the one before it was finished", () => {
		const seasons = [season("s1"), season("s2")];
		expect(nextEpisode(seasons, last("s1", 2, "2026-01-01T00:00:00Z"))).toEqual({
			next: {
				seasonId: "s2",
				episode: 1,
			},
			offered: null,
		});
	});

	test("offers a season that came out after the one before it was finished", () => {
		const seasons = [
			season("s1"),
			season("s2", {
				releasedAt: new Date("2026-06-01T00:00:00Z"),
			}),
		];
		expect(nextEpisode(seasons, last("s1", 2, "2026-01-01T00:00:00Z"))).toEqual({
			next: null,
			offered: {
				seasonId: "s2",
				episode: 1,
			},
		});
	});

	test("goes on into that season once the one before it is finished again", () => {
		const seasons = [
			season("s1"),
			season("s2", {
				releasedAt: new Date("2026-06-01T00:00:00Z"),
			}),
		];
		expect(nextEpisode(seasons, last("s1", 2, "2026-07-01T00:00:00Z"))?.next).toEqual({
			seasonId: "s2",
			episode: 1,
		});
	});

	test("goes on within a season that came out after the user started it", () => {
		const seasons = [
			season("s1", {
				releasedAt: new Date("2026-06-01T00:00:00Z"),
			}),
		];
		expect(nextEpisode(seasons, last("s1", 1, "2026-01-01T00:00:00Z"))?.next).toEqual({
			seasonId: "s1",
			episode: 2,
		});
	});

	test("offers a season still airing", () => {
		const seasons = [
			season("s1"),
			season("s2", {
				airing: true,
			}),
		];
		expect(nextEpisode(seasons, last("s1", 2, "2026-01-01T00:00:00Z"))).toEqual({
			next: null,
			offered: {
				seasonId: "s2",
				episode: 1,
			},
		});
	});

	test("goes on into a season with no known release date", () => {
		const seasons = [
			season("s1"),
			season("s2", {
				releasedAt: null,
			}),
		];
		expect(nextEpisode(seasons, last("s1", 2, "2026-01-01T00:00:00Z"))?.next).toEqual({
			seasonId: "s2",
			episode: 1,
		});
	});

	test("is null for a season that is not listed", () => {
		expect(nextEpisode([season("s1")], last("gone", 1, "2026-01-01T00:00:00Z"))).toBeNull();
		expect(nextEpisode([season("s1")], last("gone", 1, "2026-01-01T00:00:00Z", false))).toBeNull();
	});
});
