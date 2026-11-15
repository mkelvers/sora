import { describe, expect, test } from "bun:test";

import type { ProviderUnit } from "../episodes/episodes";
import type { ProviderVideo } from "../providers/provider";
import { hasDubAudio, probeVideos, withConfirmedDubs } from "./dub-audio";

const video = (url: string, format: ProviderVideo["format"] = "hls"): ProviderVideo => ({
	format,
	headers: {},
	quality: "auto",
	subtitles: [],
	url,
});

/** Probes that read each playlist's audio languages from `playlists`, by URL; one missing is unreachable. */
const probing = (playlists: Record<string, string[] | null>, requested: string[] = []) => ({
	canFetchStream: (url: string) => {
		requested.push(url);
		return Promise.resolve(!url.includes(".unreachable."));
	},
	probeStream: (url: string) => {
		requested.push(url);
		return Promise.resolve(
			url in playlists
				? {
						audioLanguages: playlists[url] ?? null,
					}
				: null,
		);
	},
});

const unit = (number: number, languages: ProviderUnit["languages"]): ProviderUnit => ({
	id: `anikoto:${number}`,
	isFiller: false,
	languages,
	number,
	title: `Episode ${number}`,
});

describe("hasDubAudio", () => {
	test("confirms a dub whose playlist has English audio, as Overgeared episode 8's has", async () => {
		const probes = await probeVideos(
			[video("https://cdn.example/master.m3u8")],
			probing({
				"https://cdn.example/master.m3u8": ["ja", "en", "ar"],
			}),
		);

		expect(hasDubAudio(probes)).toBe(true);
	});

	test("refuses a dub whose playlist has no English audio yet", async () => {
		const probes = await probeVideos(
			[video("https://cdn.example/master.m3u8")],
			probing({
				"https://cdn.example/master.m3u8": ["ja"],
			}),
		);

		expect(hasDubAudio(probes)).toBe(false);
	});

	test("takes the provider's word when no video names its audio", async () => {
		const probes = await probeVideos(
			[video("https://cdn.example/dub.m3u8"), video("https://cdn.example/dub.mp4", "mp4")],
			probing({
				"https://cdn.example/dub.m3u8": [],
			}),
		);

		expect(hasDubAudio(probes)).toBe(true);
	});

	test("refuses a dub whose playlists cannot be read, even from a host that is only throttling", async () => {
		const probes = await probeVideos(
			[video("https://cdn.example/master.m3u8"), video("https://gone.example/master.m3u8")],
			probing({
				"https://cdn.example/master.m3u8": null,
			}),
		);

		expect(probes).toEqual([
			{
				audioLanguages: null,
			},
			null,
		]);
		expect(hasDubAudio(probes)).toBe(false);
	});

	test("asks each video's host once", async () => {
		const requested: string[] = [];
		await probeVideos(
			[video("https://cdn.example/master.m3u8"), video("https://cdn.example/dub.mp4", "mp4")],
			probing(
				{
					"https://cdn.example/master.m3u8": ["en"],
				},
				requested,
			),
		);

		expect(requested).toEqual(["https://cdn.example/master.m3u8", "https://cdn.example/dub.mp4"]);
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
