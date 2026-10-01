import { describe, expect, test } from "bun:test";

import type { EpisodeAddress, PlayableSeason } from "../../series/queries";
import { statusOf } from "./status";

function season(id: string, overrides: Partial<PlayableSeason> = {}): PlayableSeason {
	return {
		id,
		kind: "season",
		number: 1,
		title: id,
		inWatchOrder: true,
		airing: false,
		episodes: [1, 2],
		releasedAt: earlier,
		...overrides,
	};
}

const watchedAt = new Date("2026-01-01T00:00:00Z");
const earlier = new Date("2025-01-01T00:00:00Z");
const later = new Date("2026-06-01T00:00:00Z");

function did(seasonIds: string[], watched: string[] = [], next: EpisodeAddress | null = null) {
	return {
		seasonIds: new Set(seasonIds),
		watched: new Map(watched.map((key) => [key, watchedAt])),
		next,
	};
}

describe("statusOf", () => {
	const seasons = [season("s1"), season("s2")];

	test("is planned with nothing played or watched", () => {
		expect(statusOf(seasons, did([]))).toBe("planned");
	});

	test("is watching in the middle of a season", () => {
		expect(statusOf(seasons, did(["s1"], ["s1:1"]))).toBe("watching");
	});

	test("is watching with a started episode and none finished", () => {
		expect(statusOf(seasons, did(["s1"]))).toBe("watching");
	});

	test("is completed when every season is watched", () => {
		expect(statusOf(seasons, did(["s1", "s2"], ["s1:1", "s1:2", "s2:1", "s2:2"]))).toBe(
			"completed",
		);
	});

	test("is watching when the next season was out as the last one was finished", () => {
		expect(statusOf(seasons, did(["s1"], ["s1:1", "s1:2"]))).toBe("watching");
	});

	test("is watching when a film or OVA sits before the next season", () => {
		const all = [season("s1"), season("ova", { kind: "ova" }), season("s2")];
		expect(statusOf(all, did(["s1"], ["s1:1", "s1:2"]))).toBe("watching");
	});

	test("is completed when the next season came out after the last one was finished", () => {
		const all = [season("s1"), season("s2", { releasedAt: later })];
		expect(statusOf(all, did(["s1"], ["s1:1", "s1:2"]))).toBe("completed");
	});

	test("is watching when the show plays on into a season that came out later", () => {
		expect(
			statusOf(
				[season("s1"), season("s2", { releasedAt: later })],
				did(["s1"], ["s1:1", "s1:2"], {
					seasonId: "s2",
					episode: 1,
				}),
			),
		).toBe("watching");
	});

	test("stays completed while an episode is watched again", () => {
		expect(
			statusOf(
				seasons,
				did(["s1", "s2"], ["s1:1", "s1:2", "s2:1", "s2:2"], {
					seasonId: "s1",
					episode: 2,
				}),
			),
		).toBe("completed");
	});

	test("stays completed when a season that came out later is never started", () => {
		expect(
			statusOf(
				[...seasons, season("s3", { airing: true, releasedAt: later })],
				did(["s1", "s2"], ["s1:1", "s1:2", "s2:1", "s2:2"]),
			),
		).toBe("completed");
	});

	test("is watching again once the new season is started", () => {
		const all = [...seasons, season("s3", { airing: true })];
		expect(statusOf(all, did(["s1", "s2", "s3"], ["s1:1", "s1:2", "s2:1", "s2:2", "s3:1"]))).toBe(
			"watching",
		);
	});

	test("is watching while caught up with a season that is still airing", () => {
		const all = [season("s1", { airing: true })];
		expect(statusOf(all, did(["s1"], ["s1:1", "s1:2"]))).toBe("watching");
	});

	test("is completed once an airing season has finished and been watched", () => {
		const all = [season("s1", { airing: false })];
		expect(statusOf(all, did(["s1"], ["s1:1", "s1:2"]))).toBe("completed");
	});

	test("ignores a film or OVA that was not started", () => {
		const all = [season("s1"), season("film", { kind: "movie" })];
		expect(statusOf(all, did(["s1"], ["s1:1", "s1:2"]))).toBe("completed");
	});

	test("ignores a film or OVA that was started when a regular season exists", () => {
		const all = [season("s1"), season("film", { kind: "movie", episodes: [1] })];
		expect(statusOf(all, did(["s1", "film"], ["s1:1", "s1:2"]))).toBe("completed");
	});

	test("is watching in the middle of a film played last", () => {
		const all = [season("s1"), season("film", { kind: "movie", episodes: [1] })];
		expect(
			statusOf(
				all,
				did(["s1", "film"], ["s1:1", "s1:2"], {
					seasonId: "film",
					episode: 1,
				}),
			),
		).toBe("watching");
	});

	test("counts a film when the show has no season that was started", () => {
		const all = [season("s1"), season("film", { kind: "movie", episodes: [1] })];
		expect(statusOf(all, did(["film"]))).toBe("watching");
		expect(statusOf(all, did(["film"], ["film:1"]))).toBe("completed");
	});

	test("counts an extra when it is all the user started", () => {
		const all = [season("s1"), season("extra", { kind: "ova", inWatchOrder: false })];
		expect(statusOf(all, did(["extra"], ["extra:1", "extra:2"]))).toBe("completed");
	});
});
