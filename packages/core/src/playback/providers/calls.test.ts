import { describe, expect, test } from "bun:test";

import { anime } from "../../catalog/models/anime.fixture";
import { recorded } from "./calls";
import type { ProviderCall } from "./calls";
import type { ProviderEpisode, ProviderStream, StreamProvider } from "./provider";

const episode: ProviderEpisode = {
	id: "fake:1",
	isFiller: null,
	languages: ["sub"],
	number: 1,
	title: "Episode 1",
};

const stream: ProviderStream = {
	skipSegments: [],
	videos: [
		{
			format: "hls",
			headers: {},
			quality: "auto",
			subtitles: [],
			url: "https://fake.example/master.m3u8",
		},
	],
};

/** A provider that answers with `answers`, wrapped so its calls land in `calls`. */
class Fake {
	readonly calls: ProviderCall[] = [];
	readonly provider: StreamProvider;

	constructor(answers: Partial<StreamProvider>, record?: (call: ProviderCall) => Promise<void>) {
		this.provider = recorded(
			{
				findMedia: () => Promise.resolve(null),
				id: "fake",
				listEpisodes: () => Promise.resolve([]),
				listsLanguages: true,
				locale: "en",
				resolveStream: () => Promise.resolve(stream),
				...answers,
			},
			record ??
				((call) => {
					this.calls.push(call);

					return Promise.resolve();
				}),
		);
	}
}

describe("recorded", () => {
	test("records a result as ok and passes it through", async () => {
		const { provider, calls } = new Fake({
			listEpisodes: () => Promise.resolve([episode]),
		});

		expect(await provider.listEpisodes("1")).toEqual([episode]);
		expect(await provider.resolveStream("fake:1", "sub")).toBe(stream);
		expect(calls.map((call) => `${call.operation}:${call.outcome}`)).toEqual([
			"list_episodes:ok",
			"resolve_stream:ok",
		]);
	});

	test("records no match and no episodes as empty, which a broken scraper often returns", async () => {
		const { provider, calls } = new Fake({});

		expect(await provider.findMedia(anime(1))).toBeNull();
		expect(await provider.listEpisodes("1")).toEqual([]);
		expect(calls.map((call) => `${call.operation}:${call.outcome}`)).toEqual([
			"find_media:empty",
			"list_episodes:empty",
		]);
	});

	test("records a thrown error as failed with its message, and rethrows it", async () => {
		const error = new Error("MegaPlay has no dub source for this episode");

		const { provider, calls } = new Fake({
			resolveStream: () => Promise.reject(error),
		});

		await expect(provider.resolveStream("fake:1", "dub")).rejects.toBe(error);
		expect(calls).toEqual([
			expect.objectContaining({
				error: "MegaPlay has no dub source for this episode",
				operation: "resolve_stream",
				outcome: "failed",
				provider: "fake",
			}),
		]);
	});

	test("cuts long error messages, such as ones quoting a whole page", async () => {
		const { provider, calls } = new Fake({
			listEpisodes: () => Promise.reject(new Error("x".repeat(10_000))),
		});

		await expect(provider.listEpisodes("1")).rejects.toThrow();

		expect(calls[0]?.error?.length).toBe(500);
	});

	test("keeps no error for calls that did not fail", async () => {
		const { provider, calls } = new Fake({});

		await provider.findMedia(anime(1));

		expect(calls[0]?.error).toBeNull();
	});

	test("never fails a call because recording it failed", async () => {
		const { provider } = new Fake(
			{
				listEpisodes: () => Promise.resolve([episode]),
			},
			() => Promise.reject(new Error("database is down")),
		);

		expect(await provider.listEpisodes("1")).toEqual([episode]);
	});

	test("offers syncCatalog only when the provider has one", async () => {
		const { provider: without } = new Fake({});

		const { provider: withSync, calls } = new Fake({
			syncCatalog: () => Promise.resolve("Synced 3 series"),
		});

		expect(without.syncCatalog).toBeUndefined();
		expect(
			await withSync.syncCatalog?.({
				full: false,
			}),
		).toBe("Synced 3 series");
		expect(calls.map((call) => `${call.operation}:${call.outcome}`)).toEqual(["sync_catalog:ok"]);
	});

	test("keeps the provider's ID and traits", () => {
		const { provider } = new Fake({
			id: "megaplay",
			listsLanguages: false,
		});

		expect([provider.id, provider.locale, provider.listsLanguages]).toEqual([
			"megaplay",
			"en",
			false,
		]);
	});
});
