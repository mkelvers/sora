import { describe, expect, test } from "bun:test";

import { Hono } from "hono";

import type { V1Env } from "./errors";
import { rateLimit } from "./rate-limit";

/** Routes behind `rateLimit`, asked as the account in the `x-account` header. */
class Limited {
	readonly #routes: Hono<V1Env>;

	constructor(limit: number, windowMs = 60_000) {
		this.#routes = new Hono<V1Env>()
			.use(async (c, proceed) => {
				c.set("accountId", c.req.header("x-account") ?? "a");
				await proceed();
			})
			.use(
				rateLimit({
					limit,
					windowMs,
				}),
			)
			.get("/", (c) => c.text("ok"));
	}

	get(account = "a") {
		return this.#routes.request("/", {
			headers: {
				"x-account": account,
			},
		});
	}

	async status(account = "a") {
		const response = await this.get(account);

		return response.status;
	}
}

describe("rateLimit", () => {
	test("answers 429 with Retry-After past the limit, per account", async () => {
		const routes = new Limited(2);

		expect(await routes.status()).toBe(200);
		expect(await routes.status()).toBe(200);
		const limited = await routes.get();

		expect(limited.status).toBe(429);
		expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
		expect(await limited.json()).toMatchObject({
			code: "TOO_MANY_REQUESTS",
		});
		expect(await routes.status("b")).toBe(200);
	});

	test("starts a new window once the old one ends", async () => {
		const routes = new Limited(1, 20);

		expect(await routes.status()).toBe(200);
		expect(await routes.status()).toBe(429);
		await Bun.sleep(30);

		expect(await routes.status()).toBe(200);
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
