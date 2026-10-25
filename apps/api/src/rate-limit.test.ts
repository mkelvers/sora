import { describe, expect, test } from "bun:test";

import { Hono } from "hono";

import type { V1Env } from "./errors";
import { rateLimit } from "./rate-limit";

const app = (limit: number, windowMs = 60_000) =>
	new Hono<V1Env>()
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

const get = (routes: ReturnType<typeof app>, account = "a") =>
	routes.request("/", {
		headers: {
			"x-account": account,
		},
	});

const statusOf = async (routes: ReturnType<typeof app>, account = "a") => {
	const response = await get(routes, account);
	return response.status;
};

describe("rateLimit", () => {
	test("answers 429 with Retry-After past the limit, per account", async () => {
		const routes = app(2);

		expect(await statusOf(routes)).toBe(200);
		expect(await statusOf(routes)).toBe(200);
		const limited = await get(routes);

		expect(limited.status).toBe(429);
		expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
		expect(((await limited.json()) as { code: string }).code).toBe("TOO_MANY_REQUESTS");
		expect(await statusOf(routes, "b")).toBe(200);
	});

	test("starts a new window once the old one ends", async () => {
		const routes = app(1, 20);

		expect(await statusOf(routes)).toBe(200);
		expect(await statusOf(routes)).toBe(429);
		await Bun.sleep(30);

		expect(await statusOf(routes)).toBe(200);
	});

	test("counts by the key it is given instead of the account", async () => {
		const routes = new Hono<V1Env>()
			.use(
				rateLimit({
					key: (c) => c.req.header("x-address") ?? "",
					limit: 1,
					windowMs: 60_000,
				}),
			)
			.get("/", (c) => c.text("ok"));
		const fromAddress = async (address: string) => {
			const response = await routes.request("/", {
				headers: {
					"x-address": address,
				},
			});
			return response.status;
		};

		expect(await fromAddress("a")).toBe(200);
		expect(await fromAddress("a")).toBe(429);
		expect(await fromAddress("b")).toBe(200);
	});
});
