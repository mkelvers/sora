import { describe, expect, test } from "bun:test";

import { defaultAudioLanguage, rewritePlaylist } from "./playlist";

const sign = (url: string, kind: string) => `<${kind}:${url}>`;

describe("rewritePlaylist", () => {
	test("marks master playlist variants and renditions as playlists", () => {
		const master = [
			"#EXTM3U",
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Japanese",URI="audio/ja.m3u8"',
			"#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080",
			"1080/index.m3u8",
			"#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720",
			"https://other.example.com/720/index.m3u8",
		].join("\n");

		expect(rewritePlaylist(master, "https://cdn.example.com/show/master.m3u8", sign)).toBe(
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

		expect(rewritePlaylist(media, "https://cdn.example.com/show/1080/index.m3u8", sign)).toBe(
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

/** The master playlist MegaPlay's CDN served for Overgeared episode 8, cut to three audio renditions. */
const multiAudioMaster = (defaultLanguage: "ja" | "en") =>
	[
		"#EXTM3U",
		`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Japanese",DEFAULT=${defaultLanguage === "ja" ? "YES" : "NO"},AUTOSELECT=${defaultLanguage === "ja" ? "YES" : "NO"},LANGUAGE="ja",CHANNELS="2",URI="audio/ja/index.m3u8"`,
		`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",DEFAULT=${defaultLanguage === "en" ? "YES" : "NO"},AUTOSELECT=${defaultLanguage === "en" ? "YES" : "NO"},LANGUAGE="en",CHANNELS="2",URI="audio/en/index.m3u8"`,
		'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Arabic",DEFAULT=NO,AUTOSELECT=NO,LANGUAGE="ar",CHANNELS="2",URI="audio/ar/index.m3u8"',
		'#EXT-X-STREAM-INF:BANDWIDTH=5500000,RESOLUTION=1920x1080,CODECS="avc1.4d401f,mp4a.40.2",AUDIO="aac",NAME="1080p"',
		"index-f1.m3u8",
	].join("\n");

describe("defaultAudioLanguage", () => {
	test("reads the audio rendition marked default, as MegaPlay marks Japanese for a sub", () => {
		expect(defaultAudioLanguage(multiAudioMaster("ja"))).toBe("ja");
	});

	test("reads English when the playlist marks it default, as MegaPlay does for a dub", () => {
		expect(defaultAudioLanguage(multiAudioMaster("en"))).toBe("en");
	});

	test("takes the first audio rendition when none is marked default", () => {
		const master = [
			"#EXTM3U",
			'#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="subs/en.m3u8"',
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Japanese",LANGUAGE="ja",URI="audio/ja.m3u8"',
			'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="English",LANGUAGE="en",URI="audio/en.m3u8"',
			'#EXT-X-STREAM-INF:BANDWIDTH=5000000,AUDIO="aac"',
			"1080/index.m3u8",
		].join("\n");

		expect(defaultAudioLanguage(master)).toBe("ja");
	});

	test("does not know the language of audio that comes with the video", () => {
		const master = ["#EXTM3U", "#EXT-X-STREAM-INF:BANDWIDTH=5000000", "1080/index.m3u8"].join("\n");

		expect(defaultAudioLanguage(master)).toBeNull();
	});
});
