import { describe, expect, test } from "bun:test";

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

const signedIn = () => Promise.resolve(true);

const probe = async (routes: ReturnType<typeof healthRoutes>) => {
	const response = await routes.request("/");
	return {
		body: (await response.json()) as {
			status: string;
			providers?: unknown[] | null;
		},
		status: response.status,
	};
};

describe("/health", () => {
	test("stays ok while a provider fails, and reports providers in snake_case without error messages", async () => {
		const { status, body } = await probe(healthRoutes(() => Promise.resolve([anikoto]), signedIn));

		expect(status).toBe(200);
		expect(body).toEqual({
			providers: [
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
			],
			status: "ok",
		});
	});

	test("tells anonymous requests nothing but that it is ok, and does not read providers for them", async () => {
		let loads = 0;
		const routes = healthRoutes(() => {
			loads += 1;
			return Promise.resolve([anikoto]);
		});

		expect(await probe(routes)).toEqual({
			body: {
				status: "ok",
			},
			status: 200,
		});
		expect(loads).toBe(0);
	});

	test("reads provider health once for probes within a minute", async () => {
		let loads = 0;
		const routes = healthRoutes(() => {
			loads += 1;
			return Promise.resolve([anikoto]);
		}, signedIn);

		await probe(routes);
		await probe(routes);

		expect(loads).toBe(1);
	});

	test("stays ok without providers when their health cannot be read, and tries again next probe", async () => {
		let loads = 0;
		const routes = healthRoutes(() => {
			loads += 1;
			if (loads === 1) {
				return Promise.reject(new Error("database is down"));
			}
			return Promise.resolve([anikoto]);
		}, signedIn);

		expect(await probe(routes)).toEqual({
			body: {
				providers: null,
				status: "ok",
			},
			status: 200,
		});
		const result = await probe(routes);

		expect(result.body.providers).toHaveLength(1);
	});
});
