import { describe, expect, test } from "bun:test";

import type { PlaybackMedia } from "../models/playback";
import { choosePlayback } from "./choice";

const track = (
	language: string,
	kind: "dialogue" | "signs" | null,
	isDefault = false,
): PlaybackMedia["subtitles"][number] => ({
	default: isDefault,
	format: "vtt",
	kind,
	label: language,
	language,
	url: `${language}-${kind}`,
});

const sub = {
	audio: "sub" as const,
	subtitles: [track("en", "signs"), track("en", "dialogue", true), track("de", "dialogue")],
};
const dub = {
	audio: "dub" as const,
	subtitles: [track("en", "dialogue", true)],
};

describe("choosePlayback", () => {
	test("plays the preferred audio with its default track", () => {
		const chosen = choosePlayback([dub, sub], {
			audio: "sub",
			subtitles: {},
		});

		expect(chosen.media).toBe(sub);
		expect(chosen.subtitle?.url).toBe("en-dialogue");
	});

	test("plays the first version when the preferred audio is missing", () => {
		expect(
			choosePlayback([dub], {
				audio: "raw",
				subtitles: {},
			}).media,
		).toBe(dub);
	});

	test("falls back from a dub to a sub, then raw, and from a sub to raw, then a dub", () => {
		const raw = {
			audio: "raw" as const,
			subtitles: [],
		};

		expect(choosePlayback([raw, sub], { audio: "dub", subtitles: {} }).media).toBe(sub);
		expect(choosePlayback([raw], { audio: "dub", subtitles: {} }).media).toBe(raw);
		expect(choosePlayback([dub, raw], { audio: "sub", subtitles: {} }).media).toBe(raw);
		expect(choosePlayback([dub], { audio: "sub", subtitles: {} }).media).toBe(dub);
	});

	test("picks the chosen language and kind, else the language", () => {
		expect(
			choosePlayback([sub], {
				audio: null,
				subtitles: {
					sub: {
						kind: "signs",
						language: "en",
					},
				},
			}).subtitle?.url,
		).toBe("en-signs");
		expect(
			choosePlayback([sub], {
				audio: null,
				subtitles: {
					sub: {
						kind: "captions",
						language: "de",
					},
				},
			}).subtitle?.url,
		).toBe("de-dialogue");
	});

	test("shows no track when subtitles are off or the version is raw", () => {
		expect(
			choosePlayback([sub], {
				audio: null,
				subtitles: {
					sub: null,
				},
			}).subtitle,
		).toBeUndefined();
		expect(
			choosePlayback(
				[
					{
						audio: "raw" as const,
						subtitles: [],
					},
				],
				{
					audio: null,
					subtitles: {},
				},
			).subtitle,
		).toBeUndefined();
	});
});
