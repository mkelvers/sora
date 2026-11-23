import { describe, expect, test } from "bun:test";

import { master } from "./playlist.fixture";
import { streamTimeline } from "./proxy";
import type { PlaylistReader } from "./proxy";

/** Playlists served by URL, a reader of them, and the URLs it was asked for. */
class Playlists {
	readonly requested: string[] = [];
	readonly #playlists: Record<string, string>;

	constructor(playlists: Record<string, string>) {
		this.#playlists = playlists;
	}

	read: PlaylistReader = (url) => {
		this.requested.push(url);
		const content = this.#playlists[url];

		if (content === undefined) {
			return Promise.reject(new Error(`${url} is not served`));
		}

		return Promise.resolve({
			content,
			url,
		});
	};
}

const mediaPlaylist = [
	"#EXTM3U",
	"#EXTINF:6.0,",
	"seg-1.ts",
	"#EXTINF:4.5,",
	"seg-2.ts",
	"#EXT-X-ENDLIST",
].join("\n");

describe("streamTimeline", () => {
	test("reads a master playlist's first variant through the reader it is given", async () => {
		const { read, requested } = new Playlists({
			"https://cdn.example/show/index-f1.m3u8": mediaPlaylist,
			"https://cdn.example/show/master.m3u8": master(["ja", "en"]),
		});

		expect(await streamTimeline("https://cdn.example/show/master.m3u8", {}, read)).toEqual({
			duration: 10.5,
			starts: [0, 6],
		});
		expect(requested).toEqual([
			"https://cdn.example/show/master.m3u8",
			"https://cdn.example/show/index-f1.m3u8",
		]);
	});

	test("reads a media playlist alone", async () => {
		const { read, requested } = new Playlists({
			"https://cdn.example/show/index.m3u8": mediaPlaylist,
		});

		expect(await streamTimeline("https://cdn.example/show/index.m3u8", {}, read)).toEqual({
			duration: 10.5,
			starts: [0, 6],
		});
		expect(requested).toEqual(["https://cdn.example/show/index.m3u8"]);
	});
});
