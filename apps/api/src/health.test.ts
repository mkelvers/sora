import { describe, expect, test } from "bun:test";

import type { FailingJobs } from "@sora/core/models/scheduler";
import type { ProviderHealth } from "@sora/core/playback";

import { healthRoutes } from "./health";

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

const signedIn = () => Promise.resolve(true);
const providers = () => Promise.resolve([anikoto]);
const failingJobs = () => Promise.resolve([lookUpEpisodes]);

const probe = async (routes: ReturnType<typeof healthRoutes>) => {
	const response = await routes.request("/");
	return {
		body: (await response.json()) as {
			status: string;
			failing_jobs?: unknown[] | null;
			providers?: unknown[] | null;
		},
		status: response.status,
	};
};

describe("/health", () => {
	test("stays ok while a provider fails, and reports providers in snake_case without error messages", async () => {
		const { status, body } = await probe(
			healthRoutes({
				failingJobs,
				providers,
				signedIn,
			}),
		);

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
		const { status, body } = await probe(
			healthRoutes({
				failingJobs,
				providers,
				signedIn,
			}),
		);

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
		const routes = healthRoutes({
			failingJobs: () => {
				loads += 1;
				return failingJobs();
			},
			providers: () => {
				loads += 1;
				return providers();
			},
		});

		expect(await probe(routes)).toEqual({
			body: {
				status: "ok",
			},
			status: 200,
		});
		expect(loads).toBe(0);
	});

	test("reads providers and jobs on every signed-in probe", async () => {
		let loads = 0;
		const routes = healthRoutes({
			failingJobs: () => {
				loads += 1;
				return failingJobs();
			},
			providers: () => {
				loads += 1;
				return providers();
			},
			signedIn,
		});

		await probe(routes);
		await probe(routes);

		expect(loads).toBe(4);
	});

	test("stays ok with providers but without jobs when the jobs cannot be read", async () => {
		const { status, body } = await probe(
			healthRoutes({
				failingJobs: () => Promise.reject(new Error("database is down")),
				providers,
				signedIn,
			}),
		);

		expect(status).toBe(200);
		expect(body.status).toBe("ok");
		expect(body.failing_jobs).toBeNull();
		expect(body.providers).toHaveLength(1);
	});

	test("stays ok with jobs but without providers when their health cannot be read", async () => {
		const { status, body } = await probe(
			healthRoutes({
				failingJobs,
				providers: () => Promise.reject(new Error("database is down")),
				signedIn,
			}),
		);

		expect(status).toBe(200);
		expect(body.providers).toBeNull();
		expect(body.failing_jobs).toHaveLength(1);
	});
});
