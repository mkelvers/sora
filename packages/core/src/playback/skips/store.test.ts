import { describe, expect, test } from "bun:test";

import { day } from "@sora/shared";

import { isDue, videoKey } from "./store";
import { unsettled } from "./store.fixture";

describe("skipDetectionKey", () => {
	test("is the same whichever host serves the playlist", () => {
		expect(videoKey("https://a.example/anime/1/sub/master.m3u8")).toBe(
			videoKey("https://b.example/anime/1/sub/master.m3u8?token=2"),
		);
	});

	test("differs between a sub and its dub", () => {
		expect(videoKey("https://a.example/anime/1/sub/master.m3u8")).not.toBe(
			videoKey("https://a.example/anime/1/dub/master.m3u8"),
		);
	});
});

describe("isSkipDetectionDue", () => {
	test("is due for a video never looked at", () => {
		expect(isDue(undefined)).toBe(true);
	});

	test("is never due again once both songs were found", () => {
		expect(
			isDue({
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
		expect(isDue(unsettled(0, 3))).toBe(false);
		expect(isDue(unsettled(0, 15))).toBe(true);
		expect(isDue(unsettled(2, 15))).toBe(true);
	});
});
