import { describe, expect, test } from "bun:test";

import { masterPlaylist } from "./playlist.fixture";
import { streamTimeline } from "./proxy";
import type { PlaylistReader } from "./proxy";

/** A reader serving `playlists` by URL, and the URLs it was asked for. */
const serving = (playlists: Record<string, string>) => {
	const requested: string[] = [];
	const read: PlaylistReader = (url) => {
		requested.push(url);
		const content = playlists[url];
		return content === undefined
			? Promise.reject(new Error(`${url} is not served`))
			: Promise.resolve({
					content,
					url,
				});
	};
	return {
		read,
		requested,
	};
};

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
		const { read, requested } = serving({
			"https://cdn.example/show/index-f1.m3u8": mediaPlaylist,
			"https://cdn.example/show/master.m3u8": masterPlaylist(["ja", "en"]),
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
		const { read, requested } = serving({
			"https://cdn.example/show/index.m3u8": mediaPlaylist,
		});

		expect(await streamTimeline("https://cdn.example/show/index.m3u8", {}, read)).toEqual({
			duration: 10.5,
			starts: [0, 6],
		});
		expect(requested).toEqual(["https://cdn.example/show/index.m3u8"]);
	});
});
