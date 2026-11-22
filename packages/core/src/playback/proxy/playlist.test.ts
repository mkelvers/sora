import { describe, expect, test } from "bun:test";

import { audioLanguages, rewrite, withDefaultAudio } from "./playlist";

describe("rewrite", () => {
	test("marks master playlist variants and renditions as playlists", () => {
		const master = [
			"#EXTM3U",
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Japanese",URI="audio/ja.m3u8"',
			"#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080",
			"1080/index.m3u8",
			"#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720",
			"https://other.example.com/720/index.m3u8",
		].join("\n");

		expect(
			rewrite(
				master,
				"https://cdn.example.com/show/master.m3u8",
				(url, kind) => `<${kind}:${url}>`,
			),
		).toBe(
			[
				"#EXTM3U",
				'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Japanese",URI="<playlist:https://cdn.example.com/show/audio/ja.m3u8>"',
				"#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080",
				"<playlist:https://cdn.example.com/show/1080/index.m3u8>",
				"#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720",
				"<playlist:https://other.example.com/720/index.m3u8>",
			].join("\n"),
		);
	});

	test("marks media playlist segments, init sections, and keys", () => {
		const media = [
			"#EXTM3U",
			"#EXT-X-TARGETDURATION:6",
			'#EXT-X-KEY:METHOD=AES-128,URI="/keys/1.key",IV=0x1',
			'#EXT-X-MAP:URI="init.mp4"',
			"#EXTINF:6.0,",
			"seg-1.ts?token=abc",
			"",
			"#EXT-X-ENDLIST",
		].join("\r\n");

		expect(
			rewrite(
				media,
				"https://cdn.example.com/show/1080/index.m3u8",
				(url, kind) => `<${kind}:${url}>`,
			),
		).toBe(
			[
				"#EXTM3U",
				"#EXT-X-TARGETDURATION:6",
				'#EXT-X-KEY:METHOD=AES-128,URI="<key:https://cdn.example.com/keys/1.key>",IV=0x1',
				'#EXT-X-MAP:URI="<segment:https://cdn.example.com/show/1080/init.mp4>"',
				"#EXTINF:6.0,",
				"<segment:https://cdn.example.com/show/1080/seg-1.ts?token=abc>",
				"",
				"#EXT-X-ENDLIST",
			].join("\n"),
		);
	});
});

/** The master playlist MegaPlay's CDN served for Overgeared episode 8's sub and dub, cut to three audio renditions. */
const overgearedMaster = [
	"#EXTM3U",
	'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Japanese",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="ja",CHANNELS="2",URI="audio/ja/index.m3u8"',
	'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="en",CHANNELS="2",URI="audio/en/index.m3u8"',
	'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Arabic",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="ar",CHANNELS="2",URI="audio/ar/index.m3u8"',
	'#EXT-X-STREAM-INF:BANDWIDTH=5500000,RESOLUTION=1920x1080,CODECS="avc1.4d401f,mp4a.40.2",AUDIO="aac",NAME="1080p"',
	"index-f1.m3u8",
].join("\n");

describe("audioLanguages", () => {
	test("lists each audio rendition's language, as for Overgeared episode 8", () => {
		expect(audioLanguages(overgearedMaster)).toEqual(["ja", "en", "ar"]);
	});

	test("lists none when the audio comes with the video", () => {
		const master = ["#EXTM3U", "#EXT-X-STREAM-INF:BANDWIDTH=5000000", "1080/index.m3u8"].join("\n");

		expect(audioLanguages(master)).toEqual([]);
	});

	test("leaves out subtitle renditions", () => {
		const master = [
			"#EXTM3U",
			'#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="subs/en.m3u8"',
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Japanese",LANGUAGE="ja",URI="audio/ja.m3u8"',
		].join("\n");

		expect(audioLanguages(master)).toEqual(["ja"]);
	});
});

describe("withDefaultAudio", () => {
	test("makes English the audio players start with, and Japanese not", () => {
		const lines = withDefaultAudio(overgearedMaster, "en").split("\n");

		expect(lines[1]).toContain('NAME="Japanese",DEFAULT=NO,AUTOSELECT=NO,');
		expect(lines[2]).toContain('NAME="English",DEFAULT=YES,AUTOSELECT=YES,');
		expect(lines[3]).toContain('NAME="Arabic",DEFAULT=NO,AUTOSELECT=NO,');
		expect(audioLanguages(lines.join("\n"))).toEqual(["ja", "en", "ar"]);
	});

	test("adds the attributes to renditions that leave them out", () => {
		const master = [
			"#EXTM3U",
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Japanese",LANGUAGE="ja",URI="audio/ja.m3u8"',
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",LANGUAGE="en-US",URI="audio/en.m3u8"',
		].join("\n");

		expect(withDefaultAudio(master, "en").split("\n").slice(1)).toEqual([
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Japanese",LANGUAGE="ja",URI="audio/ja.m3u8",DEFAULT=NO,AUTOSELECT=NO',
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",LANGUAGE="en-US",URI="audio/en.m3u8",DEFAULT=YES,AUTOSELECT=YES',
		]);
	});

	test("leaves a playlist without audio in the locale as it is", () => {
		const master = overgearedMaster.replace(/^.*NAME="English".*\n/mu, "");

		expect(withDefaultAudio(master, "en")).toBe(master);
	});
});
