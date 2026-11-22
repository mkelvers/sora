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

	test("keeps the selected variant when a language has multiple dialogue tracks", () => {
		const first = { ...track("es", "dialogue"), variant: "first" };
		const alternate = { ...first, url: "alternate-url", variant: "alternate" };
		const media = { ...sub, subtitles: [first, alternate] };
		const preferences = {
			audio: "sub",
			subtitles: { sub: { kind: "dialogue", language: "es", variant: "alternate" } },
		} as const;

		expect(choosePlayback([media], preferences).subtitle).toBe(alternate);
		const refreshed = { ...alternate, url: "refreshed-url" };
		expect(
			choosePlayback([{ ...media, subtitles: [refreshed, first] }], preferences).subtitle,
		).toBe(refreshed);
		expect(choosePlayback([{ ...media, subtitles: [first] }], preferences).subtitle).toBe(first);
	});

	test("falls back to another region of the preferred language before using the default", () => {
		const spanish = track("es-419", "dialogue");
		const media = { ...sub, subtitles: [...sub.subtitles, spanish] };
		expect(
			choosePlayback([media], {
				audio: "sub",
				subtitles: { sub: { kind: "dialogue", language: "es-ES" } },
			}).subtitle,
		).toBe(spanish);
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
