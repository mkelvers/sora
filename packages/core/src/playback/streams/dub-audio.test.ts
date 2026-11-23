import { describe, expect, test } from "bun:test";

import { master } from "../proxy/playlist.fixture";
import { StreamUpstreamError } from "../proxy/upstream-error";
import { hasDubAudio, probeVideos, withConfirmedDubs } from "./dub-audio";
import type { ProbeDependencies } from "./dub-audio";
import { unit, video } from "./dub-audio.fixture";

/**
 * Hosts serving playlists that list the audio languages in `playlists`, by
 * URL: `null` throttles, and a URL missing is unreachable. `requested`
 * collects every URL asked for.
 */
class Hosts {
	readonly requested: string[] = [];
	readonly #playlists: Record<string, string[] | null>;

	constructor(playlists: Record<string, string[] | null>) {
		this.#playlists = playlists;
	}

	/** How {@link probeVideos} reaches these hosts. */
	get dependencies(): ProbeDependencies {
		return {
			canFetchStream: (url) => {
				this.requested.push(url);

				return Promise.resolve(!url.includes(".unreachable."));
			},
			readPlaylist: (url) => {
				this.requested.push(url);
				const languages = this.#playlists[url];

				if (languages === undefined) {
					return Promise.reject(new StreamUpstreamError("Upstream could not be reached", null));
				}

				if (languages === null) {
					return Promise.reject(new StreamUpstreamError("Upstream throttles", 429));
				}

				return Promise.resolve({
					content: master(languages),
					url,
				});
			},
		};
	}
}

describe("hasDubAudio", () => {
	test("confirms a dub whose playlist has English audio, as Overgeared episode 8's has", async () => {
		const probes = await probeVideos(
			[video("https://cdn.example/master.m3u8")],
			new Hosts({
				"https://cdn.example/master.m3u8": ["ja", "en", "ar"],
			}).dependencies,
		);

		expect(hasDubAudio(probes)).toBe(true);
	});

	test("refuses a dub whose playlist has no English audio yet", async () => {
		const probes = await probeVideos(
			[video("https://cdn.example/master.m3u8")],
			new Hosts({
				"https://cdn.example/master.m3u8": ["ja"],
			}).dependencies,
		);

		expect(hasDubAudio(probes)).toBe(false);
	});

	test("takes the provider's word when no video names its audio", async () => {
		const probes = await probeVideos(
			[video("https://cdn.example/dub.m3u8"), video("https://cdn.example/dub.mp4", "mp4")],
			new Hosts({
				"https://cdn.example/dub.m3u8": [],
			}).dependencies,
		);

		expect(hasDubAudio(probes)).toBe(true);
	});

	test("refuses a dub whose playlists cannot be read, even from a host that is only throttling", async () => {
		const probes = await probeVideos(
			[video("https://cdn.example/master.m3u8"), video("https://gone.example/master.m3u8")],
			new Hosts({
				"https://cdn.example/master.m3u8": null,
			}).dependencies,
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
		const hosts = new Hosts({
			"https://cdn.example/master.m3u8": ["en"],
		});

		await probeVideos(
			[video("https://cdn.example/master.m3u8"), video("https://cdn.example/dub.mp4", "mp4")],
			hosts.dependencies,
		);

		expect(hosts.requested).toEqual([
			"https://cdn.example/master.m3u8",
			"https://cdn.example/dub.mp4",
		]);
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
