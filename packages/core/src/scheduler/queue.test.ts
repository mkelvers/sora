import { describe, expect, mock, test } from "bun:test";

mock.module("../database/client", () => ({
	db: {},
}));

const { viewerWaitingPriority } = await import("../anilist/client");
const { seriesStorePriority } = await import("./queue");

describe("seriesStorePriority", () => {
	test("runs a viewer's top result ahead of the looser matches found with it", () => {
		const priorities = [0, 1, 2, 3, 4, 5].map((rank) => seriesStorePriority("waiting", rank));

		expect(priorities).toEqual([...priorities].sort((left, right) => left - right));
		expect(new Set(priorities).size).toBe(6);
	});

	test("keeps every waiting layout at or below the priority kept for viewers", () => {
		for (const rank of [0, 5, 6, 40]) {
			expect(seriesStorePriority("waiting", rank)).toBeLessThanOrEqual(viewerWaitingPriority);
		}
	});

	test("ranks nothing above the top result, however the rank is given", () => {
		expect(seriesStorePriority("waiting", -3)).toBe(seriesStorePriority("waiting", 0));
	});

	test("leaves current and backfill layouts behind every viewer's", () => {
		expect(seriesStorePriority("current")).toBeGreaterThan(viewerWaitingPriority);
		expect(seriesStorePriority("backfill")).toBeGreaterThan(seriesStorePriority("current"));
	});
});
