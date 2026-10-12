import { describe, expect, mock, test } from "bun:test";

import { Hono } from "hono";

mock.module("@sora/core/playback", () => ({
	isWebClientKey: (supplied: string | undefined) => supplied === "web-key",
	StreamUpstreamError: class extends Error {},
}));
mock.module("hono/bun", () => ({
	getConnInfo: () => ({
		remote: {
			address: "203.0.113.9",
		},
	}),
}));

const { addressOf, clientAddress } = await import("./client-address");

const routes = new Hono().use(clientAddress).get("/", (c) => c.text(addressOf(c.req.raw)));

function ask(headers: Record<string, string>) {
	return routes.request("/", {
		headers,
	});
}

describe("clientAddress", () => {
	test("replaces an address claimed by a client without the key", async () => {
		const response = await ask({
			"X-Forwarded-For": "198.51.100.7",
		});
		expect(await response.text()).toBe("203.0.113.9");
	});

	test("replaces a claim made with the wrong key", async () => {
		const response = await ask({
			"X-Forwarded-For": "198.51.100.7",
			"X-Sora-Client-Key": "guess",
		});
		expect(await response.text()).toBe("203.0.113.9");
	});

	test("keeps the address the web app reports", async () => {
		const response = await ask({
			"X-Forwarded-For": "198.51.100.7",
			"X-Sora-Client-Key": "web-key",
		});
		expect(await response.text()).toBe("198.51.100.7");
	});

	test("counts the first address of a chain", async () => {
		const response = await ask({
			"X-Forwarded-For": "198.51.100.7, 10.0.0.2",
			"X-Sora-Client-Key": "web-key",
		});
		expect(await response.text()).toBe("198.51.100.7");
	});
});
