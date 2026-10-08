import { describe, expect, test } from "bun:test";

import type { PlaybackMedia } from "../models/playback";
import { choosePlayback } from "./choice";

const track = (
	language: string,
	kind: "dialogue" | "signs" | null,
	isDefault = false,
): PlaybackMedia["subtitles"][number] => ({
	url: `${language}-${kind}`,
	language,
	label: language,
	format: "vtt",
	kind,
	default: isDefault,
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

	test("picks the chosen language and kind, else the language", () => {
		expect(
			choosePlayback([sub], {
				audio: null,
				subtitles: {
					sub: {
						language: "en",
						kind: "signs",
					},
				},
			}).subtitle?.url,
		).toBe("en-signs");
		expect(
			choosePlayback([sub], {
				audio: null,
				subtitles: {
					sub: {
						language: "de",
						kind: "captions",
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
