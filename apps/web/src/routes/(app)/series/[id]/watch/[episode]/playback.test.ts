import { expect, test } from "bun:test";

import { SoraClient } from "@sora/sdk";

import { resolveWatchPlayback } from "./playback.server";

const address = { episode: 4, seriesId: "series-1" };

const episode = (number: number) => ({
	air_date: null,
	aired_at: null,
	audio: [],
	filler: false,
	number,
	overview: null,
	runtime_minutes: null,
	still_url: null,
	title: null,
});

const catalog = () =>
	Response.json({
		meta: {
			limit: 3,
			next: null,
			offset: 0,
			previous: null,
			series_id: address.seriesId,
			total: 3,
		},
		results: [episode(2), episode(4), episode(7)],
	});

const problem = (status: number, code: string, headers?: HeadersInit) =>
	Response.json({ code, detail: "Internal provider details" }, { headers, status });

const fixture = (playback: () => Response, episodes = catalog) =>
	new SoraClient({
		baseUrl: "https://sora.test",
		fetch: (input) => {
			const { pathname } = new URL(String(input));
			switch (pathname) {
				case "/v1/series/series-1/episodes/4/playback": {
					return Promise.resolve(playback());
				}
				case "/v1/series/series-1/episodes": {
					return Promise.resolve(episodes());
				}
				default: {
					throw new Error("Unexpected fixture route");
				}
			}
		},
	});

test("keeps catalog episode links when no provider lists the episode", async () => {
	const sora = fixture(() => problem(404, "EPISODE_NOT_FOUND"));

	expect(await resolveWatchPlayback(sora, address)).toEqual({
		next: 7,
		previous: 2,
		status: "unavailable",
	});
});

test.each([
	{ code: "TOO_MANY_REQUESTS", status: 429 },
	{ code: "UPSTREAM_UNAVAILABLE", status: 503 },
])("keeps Retry-After when playback answers $status", async ({ code, status }) => {
	const sora = fixture(() => problem(status, code, { "Retry-After": "30" }));
	const before = Date.now();
	const playback = await resolveWatchPlayback(sora, address);

	expect(playback).toEqual({
		next: 7,
		previous: 2,
		retryAt: expect.any(Number),
		status: "temporary",
	});
	if ("retryAt" in playback) {
		expect(playback.retryAt).toBeGreaterThanOrEqual(before + 30_000);
		expect(playback.retryAt).toBeLessThanOrEqual(Date.now() + 30_000);
	}
});

test("keeps provider failure retryable when the catalog also fails", async () => {
	const sora = fixture(
		() => problem(502, "PLAYBACK_UNAVAILABLE"),
		() => problem(503, "UPSTREAM_UNAVAILABLE"),
	);

	expect(await resolveWatchPlayback(sora, address)).toEqual({
		next: null,
		previous: null,
		retryAt: null,
		status: "temporary",
	});
});

test("keeps unexpected HTTP errors distinct without returning their details", async () => {
	const sora = fixture(() => problem(403, "FORBIDDEN"));

	expect(await resolveWatchPlayback(sora, address)).toEqual({
		next: 7,
		previous: 2,
		status: "failed",
	});
});

const media = {
	audio: "sub",
	hardsub: false,
	label: "Sub",
	locale: "en",
	provider: "fixture",
	skip_segments: [],
	sources: [{ format: "mp4", quality: "auto", url: "https://sora.test/v1/streams/video" }],
	subtitles: [
		{
			default: true,
			format: "vtt",
			kind: "dialogue",
			label: "English",
			language: "en",
			url: "https://sora.test/v1/streams/subtitle",
		},
	],
};

const resolved = (results: unknown[]) =>
	Response.json({
		meta: {
			episode: address.episode,
			expires_at: "2030-01-01T00:00:00Z",
			next: null,
			next_episode: null,
			previous: "/v1/series/series-1/episodes/2/playback",
			previous_episode: 2,
			series_id: address.seriesId,
		},
		results,
	});

test("resolves fresh media and uses playback metadata on retry", async () => {
	let requests = 0;
	const sora = fixture(() => {
		requests += 1;
		return requests === 1 ? problem(503, "UPSTREAM_UNAVAILABLE") : resolved([media]);
	});

	const first = await resolveWatchPlayback(sora, address);
	expect(first.status).toBe("temporary");
	expect(await resolveWatchPlayback(sora, address)).toEqual({
		media: [
			{
				audio: "sub",
				label: "Sub",
				skip_segments: [],
				sources: [{ format: "mp4", quality: "auto", url: "/api/stream/video" }],
				subtitles: [
					{
						default: true,
						format: "vtt",
						kind: "dialogue",
						label: "English",
						language: "en",
						url: "/api/stream/subtitle",
					},
				],
			},
		],
		next: null,
		previous: 2,
		status: "ready",
	});
	expect(requests).toBe(2);
});

test("keeps navigation when a successful response has no playable sources", async () => {
	const sora = fixture(() => resolved([{ ...media, sources: [] }]));

	expect(await resolveWatchPlayback(sora, address)).toEqual({
		next: null,
		previous: 2,
		status: "unavailable",
	});
});
