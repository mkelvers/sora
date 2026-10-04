import { describe, expect, test } from "bun:test";

import { statusAfterPlayback } from "./status";

const finished = {
	finished: true,
	isFinale: false,
};
const finale = {
	finished: true,
	isFinale: true,
};
const partway = {
	finished: false,
	isFinale: false,
};

describe("statusAfterPlayback", () => {
	test("makes a planned series watching once an episode is finished", () => {
		expect(statusAfterPlayback("plan_to_watch", finished)).toBe("watching");
	});

	test("changes nothing when the episode is stopped partway", () => {
		expect(statusAfterPlayback("plan_to_watch", partway)).toBe("plan_to_watch");
		expect(statusAfterPlayback(null, partway)).toBeNull();
	});

	test("completes a series when its finale is finished", () => {
		expect(statusAfterPlayback("watching", finale)).toBe("completed");
	});

	test("adds a series off the watchlist as completed when its finale is finished", () => {
		expect(statusAfterPlayback(null, finale)).toBe("completed");
	});

	test("leaves a series off the watchlist for any other episode", () => {
		expect(statusAfterPlayback(null, finished)).toBeNull();
	});

	test("keeps a completed series completed on a rewatch", () => {
		expect(statusAfterPlayback("completed", finished)).toBe("completed");
		expect(statusAfterPlayback("completed", partway)).toBe("completed");
	});

	test("picks a dropped series back up when an episode is finished", () => {
		expect(statusAfterPlayback("dropped", finished)).toBe("watching");
		expect(statusAfterPlayback("dropped", partway)).toBe("dropped");
	});
});
