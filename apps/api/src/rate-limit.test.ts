import { describe, expect, mock, test } from "bun:test";

import { Hono } from "hono";

import type { V1Env } from "./errors";

// The real module reads the core's configuration on import, which the error
// handling the limiter answers with pulls in.
mock.module("@sora/core/playback", () => ({
	StreamUpstreamError: class extends Error {},
}));

const { rateLimit } = await import("./rate-limit");

function app(limit: number, windowMs = 60_000) {
	return new Hono<V1Env>()
		.use(async (c, next) => {
			c.set("accountId", c.req.header("x-account") ?? "a");
			await next();
		})
		.use(
			rateLimit({
				limit,
				windowMs,
			}),
		)
		.get("/", (c) => c.text("ok"));
}

function get(routes: ReturnType<typeof app>, account = "a") {
	return routes.request("/", {
		headers: {
			"x-account": account,
		},
	});
}

describe("rateLimit", () => {
	test("answers 429 with Retry-After past the limit, per account", async () => {
		const routes = app(2);

		expect((await get(routes)).status).toBe(200);
		expect((await get(routes)).status).toBe(200);
		const limited = await get(routes);

		expect(limited.status).toBe(429);
		expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
		expect(((await limited.json()) as { code: string }).code).toBe("TOO_MANY_REQUESTS");
		expect((await get(routes, "b")).status).toBe(200);
	});

	test("starts a new window once the old one ends", async () => {
		const routes = app(1, 20);

		expect((await get(routes)).status).toBe(200);
		expect((await get(routes)).status).toBe(429);
		await Bun.sleep(30);

		expect((await get(routes)).status).toBe(200);
	});

	test("counts by the key it is given instead of the account", async () => {
		const routes = new Hono<V1Env>()
			.use(
				rateLimit({
					limit: 1,
					windowMs: 60_000,
					key: (c) => c.req.header("x-address") ?? "",
				}),
			)
			.get("/", (c) => c.text("ok"));
		const fromAddress = (address: string) =>
			routes.request("/", {
				headers: {
					"x-address": address,
				},
			});

		expect((await fromAddress("a")).status).toBe(200);
		expect((await fromAddress("a")).status).toBe(429);
		expect((await fromAddress("b")).status).toBe(200);
	});
});
