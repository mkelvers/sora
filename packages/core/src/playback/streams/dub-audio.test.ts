import { describe, expect, test } from "bun:test";

import type { ProviderUnit } from "../episodes/episodes";
import type { ProviderVideo } from "../providers/provider";
import { dubAudioServed, withConfirmedDubs } from "./dub-audio";

const video = (url: string, format: ProviderVideo["format"] = "hls"): ProviderVideo => ({
	format,
	headers: {},
	quality: "auto",
	subtitles: [],
	url,
});

/** A reader that answers with the language each playlist starts with, failing for those missing. */
const reading = (languages: Record<string, string | null>) => (url: string) =>
	url in languages
		? Promise.resolve(languages[url] ?? null)
		: Promise.reject(new Error("Playlist cannot be fetched"));

const unit = (number: number, languages: ProviderUnit["languages"]): ProviderUnit => ({
	id: `anikoto:${number}`,
	isFiller: false,
	languages,
	number,
	title: `Episode ${number}`,
});

describe("dubAudioServed", () => {
	test("confirms a dub whose playlist starts with English audio", async () => {
		expect(
			await dubAudioServed(
				[video("https://cdn.example/master.m3u8?t=dub")],
				reading({
					"https://cdn.example/master.m3u8?t=dub": "en",
				}),
			),
		).toBe(true);
	});

	test("refuses a dub whose playlist starts with Japanese audio, as for Overgeared episode 8", async () => {
		expect(
			await dubAudioServed(
				[video("https://cdn.example/master.m3u8")],
				reading({
					"https://cdn.example/master.m3u8": "ja",
				}),
			),
		).toBe(false);
	});

	test("takes the provider's word when the playlist does not say", async () => {
		expect(
			await dubAudioServed(
				[video("https://cdn.example/dub.m3u8"), video("https://cdn.example/dub.mp4", "mp4")],
				reading({
					"https://cdn.example/dub.m3u8": null,
				}),
			),
		).toBe(true);
	});

	test("refuses a dub whose playlist cannot be read", async () => {
		expect(await dubAudioServed([video("https://cdn.example/master.m3u8")], reading({}))).toBe(
			false,
		);
	});
});

describe("withConfirmedDubs", () => {
	test("drops a newly listed dub that does not play in English, keeping its sub", async () => {
		const confirmed = await withConfirmedDubs(
			[unit(7, ["sub", "dub"]), unit(8, ["sub", "dub"])],
			[unit(7, ["sub", "dub"]), unit(8, ["sub"])],
			() => Promise.resolve(false),
		);

		expect(confirmed.map((entry) => entry.languages)).toEqual([["sub", "dub"], ["sub"]]);
	});

	test("checks only dubs the stored list did not have, including new episodes", async () => {
		const checked: number[] = [];
		await withConfirmedDubs(
			[unit(7, ["sub", "dub"]), unit(8, ["sub", "dub"]), unit(9, ["sub", "dub"])],
			[unit(7, ["sub", "dub"]), unit(8, ["sub"])],
			(entry) => {
				checked.push(entry.number);
				return Promise.resolve(true);
			},
		);

		expect(checked).toEqual([8, 9]);
	});

	test("keeps a confirmed dub", async () => {
		const confirmed = await withConfirmedDubs([unit(8, ["sub", "dub"])], [unit(8, ["sub"])], () =>
			Promise.resolve(true),
		);

		expect(confirmed.map((entry) => entry.languages)).toEqual([["sub", "dub"]]);
	});

	test("takes every dub on the provider's word when nothing was stored before", async () => {
		const confirmed = await withConfirmedDubs([unit(8, ["sub", "dub"])], null, () =>
			Promise.reject(new Error("must not be asked")),
		);

		expect(confirmed.map((entry) => entry.languages)).toEqual([["sub", "dub"]]);
	});
});
