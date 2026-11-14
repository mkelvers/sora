import { describe, expect, test } from "bun:test";

import { day } from "@sora/shared";

import { isSkipDetectionDue, skipDetectionKey } from "./store";

describe("skipDetectionKey", () => {
	test("is the same whichever host serves the playlist", () => {
		expect(skipDetectionKey("https://a.example/anime/1/sub/master.m3u8")).toBe(
			skipDetectionKey("https://b.example/anime/1/sub/master.m3u8?token=2"),
		);
	});

	test("differs between a sub and its dub", () => {
		expect(skipDetectionKey("https://a.example/anime/1/sub/master.m3u8")).not.toBe(
			skipDetectionKey("https://a.example/anime/1/dub/master.m3u8"),
		);
	});
});

const unsettled = (songs: number, daysAgo: number) => ({
	checkedAt: new Date(Date.now() - daysAgo * day),
	detection: {
		ending: null,
		opening: null,
	},
	songs,
});

describe("isSkipDetectionDue", () => {
	test("is due for a video never looked at", () => {
		expect(isSkipDetectionDue(undefined)).toBe(true);
	});

	test("is never due again once both songs were found", () => {
		expect(
			isSkipDetectionDue({
				checkedAt: new Date(Date.now() - 400 * day),
				detection: {
					ending: {
						end: 1420,
						start: 1330,
					},
					opening: "none",
				},
				songs: 2,
			}),
		).toBe(false);
	});

	test("is due again two weeks after something was left unsettled, since songs are added while a season airs", () => {
		expect(isSkipDetectionDue(unsettled(0, 3))).toBe(false);
		expect(isSkipDetectionDue(unsettled(0, 15))).toBe(true);
		expect(isSkipDetectionDue(unsettled(2, 15))).toBe(true);
	});
});
