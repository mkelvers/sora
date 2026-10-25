import { describe, expect, test } from "bun:test";

import { Hono } from "hono";

import { addressOf, clientAddress } from "./client-address";

/** The key the web app proves itself with, from the environment the tests run in. */
const webClientKey = process.env.WEB_CLIENT_KEY ?? "";

/** What Bun's server tells `getConnInfo` about the connection, which a test has no server to ask. */
const connection = {
	server: {
		requestIP: () => ({
			address: "203.0.113.9",
			family: "IPv4",
			port: 40_000,
		}),
	},
};

const routes = new Hono().use(clientAddress).get("/", (c) => c.text(addressOf(c.req.raw)));

const ask = (headers: Record<string, string>) => {
	return routes.request(
		"/",
		{
			headers,
		},
		connection,
	);
};

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
			"X-Sora-Client-Key": webClientKey,
		});
		expect(await response.text()).toBe("198.51.100.7");
	});

	test("counts the first address of a chain", async () => {
		const response = await ask({
			"X-Forwarded-For": "198.51.100.7, 10.0.0.2",
			"X-Sora-Client-Key": webClientKey,
		});
		expect(await response.text()).toBe("198.51.100.7");
	});
});
