import { expect, test } from "bun:test";

import { apiReady, webReady } from "./readiness";

test.each([
	{ body: { api_versions: [1], status: "ready" }, expected: true, status: 200 },
	{ body: { api_versions: [1, 2], status: "ready" }, expected: true, status: 200 },
	{ body: { api_versions: [2], status: "ready" }, expected: false, status: 200 },
	{ body: { api_versions: ["1"], status: "ready" }, expected: false, status: 200 },
	{ body: { status: "ok" }, expected: false, status: 200 },
	{ body: { api_versions: [1], status: "ready" }, expected: false, status: 503 },
])("API readiness returns $expected for $status and $body", async ({ body, expected, status }) => {
	using server = Bun.serve({
		fetch: (request) =>
			new URL(request.url).pathname === "/sora/ready"
				? Response.json(body, { status })
				: new Response(null, { status: 404 }),
		hostname: "127.0.0.1",
		port: 0,
	});

	expect(await apiReady(`${server.url}sora/`)).toBe(expected);
});

test("release checks reject redirects to healthy endpoints", async () => {
	using server = Bun.serve({
		fetch: (request) =>
			new URL(request.url).pathname === "/ready"
				? new Response(null, { headers: { Location: "/other" }, status: 302 })
				: Response.json({ api_versions: [1], status: "ready" }),
		hostname: "127.0.0.1",
		port: 0,
	});

	expect(await apiReady(server.url.href)).toBe(false);
	expect(await webReady(server.url.href)).toBe(false);
});

test("the web release check requires a web readiness response", async () => {
	using server = Bun.serve({
		fetch: (request) =>
			new URL(request.url).pathname === "/web/ready"
				? Response.json({ service: "web", status: "ready" })
				: Response.json({ api_versions: [1], status: "ready" }),
		hostname: "127.0.0.1",
		port: 0,
	});

	expect(await webReady(`${server.url}web`)).toBe(true);
	expect(await webReady(server.url.href)).toBe(false);
});

test("API deadline covers an incomplete response body", async () => {
	using server = Bun.serve({
		fetch: () =>
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode("{"));
					},
				}),
			),
		hostname: "127.0.0.1",
		port: 0,
	});

	expect(await apiReady(server.url.href)).toBe(false);
});
