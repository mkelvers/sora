import { describe, expect, test } from "bun:test";

import type { FailingJobs } from "@sora/core/models/scheduler";
import type { ProviderHealth } from "@sora/core/playback";
import { z } from "zod";

import { health } from "./health";

const anikoto: ProviderHealth = {
	last_error: "MegaPlay has no dub source for this episode",
	last_error_at: "2026-09-25T16:20:00.000Z",
	last_ok_at: "2026-09-25T12:00:00.000Z",
	operations: [
		{
			average_ms: 250,
			empty: 0,
			failed: 4,
			ok: 0,
			operation: "resolve_stream",
		},
	],
	provider: "anikoto",
	status: "failing",
};

const lookUpEpisodes: FailingJobs = {
	given_up: 1,
	retrying: 22,
	task: "look-up-episodes",
};

/** `/health` reading stand-ins, unless a test passes its own, and probed like a load balancer would. */
class Probe {
	readonly #routes: ReturnType<typeof health>;

	constructor({
		failingJobs = () => Promise.resolve([lookUpEpisodes]),
		providers = () => Promise.resolve([anikoto]),
		signedIn = false,
	}: {
		failingJobs?: () => Promise<FailingJobs[]>;
		providers?: () => Promise<ProviderHealth[]>;
		signedIn?: boolean;
	}) {
		this.#routes = health({
			failingJobs,
			providers,
			signedIn: () => Promise.resolve(signedIn),
		});
	}

	async send() {
		const response = await this.#routes.request("/");

		return {
			body: z
				.object({
					failing_jobs: z.array(z.json()).nullish(),
					providers: z.array(z.json()).nullish(),
					status: z.literal("ok"),
				})
				.parse(await response.json()),
			status: response.status,
		};
	}
}

describe("/health", () => {
	test("stays ok while a provider fails, and reports providers in snake_case without error messages", async () => {
		const { status, body } = await new Probe({
			signedIn: true,
		}).send();

		expect(status).toBe(200);
		expect(body.providers).toEqual([
			{
				last_error_at: "2026-09-25T16:20:00.000Z",
				last_ok_at: "2026-09-25T12:00:00.000Z",
				operations: [
					{
						average_ms: 250,
						empty: 0,
						failed: 4,
						ok: 0,
						operation: "resolve_stream",
					},
				],
				provider: "anikoto",
				status: "failing",
			},
		]);
	});

	test("reports failing scheduler jobs per task to signed-in requests", async () => {
		const { status, body } = await new Probe({
			signedIn: true,
		}).send();

		expect(status).toBe(200);
		expect(body.status).toBe("ok");
		expect(body.failing_jobs).toEqual([
			{
				given_up: 1,
				retrying: 22,
				task: "look-up-episodes",
			},
		]);
	});

	test("tells anonymous requests nothing but that it is ok, and reads neither providers nor jobs for them", async () => {
		let loads = 0;

		const probe = new Probe({
			failingJobs: () => {
				loads += 1;

				return Promise.resolve([lookUpEpisodes]);
			},
			providers: () => {
				loads += 1;

				return Promise.resolve([anikoto]);
			},
		});

		expect(await probe.send()).toEqual({
			body: {
				status: "ok",
			},
			status: 200,
		});
		expect(loads).toBe(0);
	});

	test("reads providers and jobs on every signed-in probe", async () => {
		let loads = 0;

		const probe = new Probe({
			failingJobs: () => {
				loads += 1;

				return Promise.resolve([lookUpEpisodes]);
			},
			providers: () => {
				loads += 1;

				return Promise.resolve([anikoto]);
			},
			signedIn: true,
		});

		await probe.send();
		await probe.send();

		expect(loads).toBe(4);
	});

	test("stays ok with providers but without jobs when the jobs cannot be read", async () => {
		const { status, body } = await new Probe({
			failingJobs: () => Promise.reject(new Error("database is down")),
			signedIn: true,
		}).send();

		expect(status).toBe(200);
		expect(body.status).toBe("ok");
		expect(body.failing_jobs).toBeNull();
		expect(body.providers).toHaveLength(1);
	});

	test("stays ok with jobs but without providers when their health cannot be read", async () => {
		const { status, body } = await new Probe({
			providers: () => Promise.reject(new Error("database is down")),
			signedIn: true,
		}).send();

		expect(status).toBe(200);
		expect(body.providers).toBeNull();
		expect(body.failing_jobs).toHaveLength(1);
	});
});
