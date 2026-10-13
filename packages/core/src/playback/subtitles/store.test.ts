import { describe, expect, test } from "bun:test";

import { refinementKey } from "./store";

describe("refinementKey", () => {
	test("is the same whichever host serves the playlists", () => {
		expect(
			refinementKey(
				"https://a.example/anime/1/sub/master.m3u8",
				"https://a.example/anime/1/dub/master.m3u8",
			),
		).toBe(
			refinementKey(
				"https://b.example/anime/1/sub/master.m3u8",
				"https://c.example/anime/1/dub/master.m3u8",
			),
		);
	});

	test("differs by dub, by sub, and by which is which", () => {
		const keys = [
			refinementKey("https://a.example/s1.m3u8", "https://a.example/d1.m3u8"),
			refinementKey("https://a.example/s2.m3u8", "https://a.example/d1.m3u8"),
			refinementKey("https://a.example/s1.m3u8", "https://a.example/d2.m3u8"),
			refinementKey("https://a.example/d1.m3u8", "https://a.example/s1.m3u8"),
		];

		expect(new Set(keys).size).toBe(4);
	});
});
