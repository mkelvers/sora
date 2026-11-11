import { expect, test } from "bun:test";

import { Hono } from "hono";

import { nowWatchingRoutes } from "./handlers";

const environment = { NOW_WATCHING_PROFILE_ID: "owner", PORTFOLIO_TOKEN: "portfolio-test-secret" };
const path = "/v1/public/now-watching";

test("missing and wrong tokens return the same 401 without querying progress", async () => {
	let reads = 0;
	const app = new Hono().route(
		"/v1",
		nowWatchingRoutes(() => {
			reads += 1;
			return Promise.resolve([]);
		}, environment),
	);
	const missing = await app.request(path);
	const wrong = await app.request(path, { headers: { Authorization: "Bearer wrong" } });
	expect(missing.status).toBe(401);
	expect(wrong.status).toBe(401);
	expect(await missing.json()).toEqual(await wrong.json());
	expect(reads).toBe(0);
});

test("an unset or empty token returns 404 even with authorization", async () => {
	await Promise.all(
		[undefined, ""].map(async (token) => {
			const app = new Hono().route(
				"/v1",
				nowWatchingRoutes(
					() => {
						throw new Error("Must not query progress");
					},
					{ PORTFOLIO_TOKEN: token },
				),
			);
			const response = await app.request(path, { headers: { Authorization: "Bearer wrong" } });
			expect(response.status).toBe(404);
		}),
	);
});

test("returns only titles for the configured profile without a session", async () => {
	const app = new Hono().route(
		"/v1",
		nowWatchingRoutes((profile) => {
			expect(profile).toBe("owner");
			return Promise.resolve(["Newest", "Second", "Third"]);
		}, environment),
	);
	const response = await app.request(path, {
		headers: { Authorization: `Bearer ${environment.PORTFOLIO_TOKEN}` },
	});
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ titles: ["Newest", "Second", "Third"] });
	expect(response.headers.get("Cache-Control")).toBe("no-store");
});

test("applies the existing rate limiter to authorized portfolio requests", async () => {
	const app = nowWatchingRoutes(() => Promise.resolve([]), environment);
	const responses = await Promise.all(
		Array.from({ length: 61 }, () =>
			app.request("/public/now-watching", {
				headers: { Authorization: `Bearer ${environment.PORTFOLIO_TOKEN}` },
			}),
		),
	);
	const response = responses.at(-1);
	expect(response?.status).toBe(429);
	expect(response?.headers.get("Retry-After")).not.toBeNull();
});

test("the mounted v1 endpoint bypasses session authentication", () => {
	const result = Bun.spawnSync({
		cmd: [
			process.execPath,
			"-e",
			`
      const { v1Routes } = await import("../../v1.ts");
      const { Hono } = await import("hono");
      const app = new Hono().route("/v1", v1Routes);
      const response = await app.request("/v1/public/now-watching", {
        headers: { Authorization: "Bearer mounted-test-secret" },
      });
      console.log(JSON.stringify({ status: response.status, body: await response.json() }));
    `,
		],
		cwd: import.meta.dir,
		env: { ...process.env, NOW_WATCHING_PROFILE_ID: "", PORTFOLIO_TOKEN: "mounted-test-secret" },
	});
	expect(result.exitCode).toBe(0);
	expect(JSON.parse(result.stdout.toString())).toEqual({ body: { titles: [] }, status: 200 });
});
