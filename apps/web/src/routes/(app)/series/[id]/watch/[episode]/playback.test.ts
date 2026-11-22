import { expect, test } from "bun:test";

import { SoraClient } from "@sora/sdk";

import { resolveEpisode } from "./playback.server";

const address = {
	episode: 4,
	seriesId: "series-1",
};

/** A Sora client for one episode whose playback answers, in turn, what a test queued. */
class Fixture {
	readonly #playback: (() => Response)[] = [];
	#episodes: () => Response;

	/** How often playback was asked for. */
	requests = 0;

	readonly sora = new SoraClient({
		baseUrl: "https://sora.test",
		fetch: (input) => {
			const { pathname } = new URL(String(input));

			switch (pathname) {
				case "/v1/series/series-1/episodes/4/playback": {
					this.requests += 1;

					const answer = this.#playback.shift();

					if (!answer) {
						throw new Error("No playback answer queued");
					}

					return Promise.resolve(answer());
				}

				case "/v1/series/series-1/episodes": {
					return Promise.resolve(this.#episodes());
				}

				default: {
					throw new Error("Unexpected fixture route");
				}
			}
		},
	});

	constructor() {
		this.#episodes = () =>
			Response.json({
				meta: {
					limit: 3,
					next: null,
					offset: 0,
					previous: null,
					series_id: address.seriesId,
					total: 3,
				},
				results: [2, 4, 7].map((number) => ({
					air_date: null,
					aired_at: null,
					audio: [],
					filler: false,
					number,
					overview: null,
					runtime_minutes: null,
					still_url: null,
					title: null,
				})),
			});
	}

	/** Queues a playback that fails with a problem. */
	fail(status: number, code: string, headers?: HeadersInit) {
		this.#playback.push(() =>
			Response.json(
				{
					code,
					detail: "Internal provider details",
				},
				{
					headers,
					status,
				},
			),
		);

		return this;
	}

	/** Has the episode list fail with a problem. */
	failEpisodes(status: number, code: string) {
		this.#episodes = () =>
			Response.json(
				{
					code,
					detail: "Internal provider details",
				},
				{
					status,
				},
			);

		return this;
	}

	/** Queues a playback that resolves to `results`. */
	resolve(results: unknown[]) {
		this.#playback.push(() =>
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
			}),
		);

		return this;
	}
}

const media = {
	audio: "sub",
	hardsub: false,
	label: "Sub",
	locale: "en",
	provider: "fixture",
	skip_segments: [],
	sources: [
		{
			format: "mp4",
			quality: "auto",
			url: "https://sora.test/v1/streams/video",
		},
	],
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

test("keeps catalog episode links when no provider lists the episode", async () => {
	const { sora } = new Fixture().fail(404, "EPISODE_NOT_FOUND");

	expect(await resolveEpisode(sora, address)).toEqual({
		next: 7,
		previous: 2,
		status: "unavailable",
	});
});

test.each([
	{
		code: "TOO_MANY_REQUESTS",
		status: 429,
	},
	{
		code: "UPSTREAM_UNAVAILABLE",
		status: 503,
	},
])("keeps Retry-After when playback answers $status", async ({ code, status }) => {
	const { sora } = new Fixture().fail(status, code, { "Retry-After": "30" });
	const before = Date.now();
	const playback = await resolveEpisode(sora, address);

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
	const { sora } = new Fixture()
		.fail(502, "PLAYBACK_UNAVAILABLE")
		.failEpisodes(503, "UPSTREAM_UNAVAILABLE");

	expect(await resolveEpisode(sora, address)).toEqual({
		next: null,
		previous: null,
		retryAt: null,
		status: "temporary",
	});
});

test("keeps unexpected HTTP errors distinct without returning their details", async () => {
	const { sora } = new Fixture().fail(403, "FORBIDDEN");

	expect(await resolveEpisode(sora, address)).toEqual({
		next: 7,
		previous: 2,
		status: "failed",
	});
});

test("resolves fresh media and uses playback metadata on retry", async () => {
	const fixture = new Fixture().fail(503, "UPSTREAM_UNAVAILABLE").resolve([media]);
	const { sora } = fixture;

	const first = await resolveEpisode(sora, address);
	expect(first.status).toBe("temporary");
	expect(await resolveEpisode(sora, address)).toEqual({
		media: [
			{
				audio: "sub",
				label: "Sub",
				skip_segments: [],
				sources: [
					{
						format: "mp4",
						quality: "auto",
						url: "/api/stream/video",
					},
				],
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
	expect(fixture.requests).toBe(2);
});

test("keeps navigation when a successful response has no playable sources", async () => {
	const { sora } = new Fixture().resolve([
		{
			...media,
			sources: [],
		},
	]);

	expect(await resolveEpisode(sora, address)).toEqual({
		next: null,
		previous: 2,
		status: "unavailable",
	});
});
