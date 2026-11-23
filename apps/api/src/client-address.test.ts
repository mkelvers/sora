import { describe, expect, test } from "bun:test";

import { Hono } from "hono";

import { clientAddress } from "./client-address";

/** The key the web app proves itself with, from the environment the tests run in. */
const webClientKey = process.env.WEB_CLIENT_KEY ?? "";

/** Routes behind `clientAddress` that answer with the address they forward. */
class Server {
	readonly #routes = new Hono()
		.use(clientAddress)
		.get("/", (c) => c.text(c.req.raw.headers.get("X-Forwarded-For") ?? ""));

	/** What Bun's server tells `getConnInfo` about the connection, which a test has no server to ask. */
	readonly #connection = {
		server: {
			requestIP: () => ({
				address: "203.0.113.9",
				family: "IPv4",
				port: 40_000,
			}),
		},
	};

	ask(headers: Record<string, string>) {
		return this.#routes.request(
			"/",
			{
				headers,
			},
			this.#connection,
		);
	}
}

const server = new Server();

describe("clientAddress", () => {
	test("replaces an address claimed by a client without the key", async () => {
		const response = await server.ask({
			"X-Forwarded-For": "198.51.100.7",
		});

		expect(await response.text()).toBe("203.0.113.9");
	});

	test("replaces a claim made with the wrong key", async () => {
		const response = await server.ask({
			"X-Forwarded-For": "198.51.100.7",
			"X-Sora-Client-Key": "guess",
		});

		expect(await response.text()).toBe("203.0.113.9");
	});

	test("keeps the address the web app reports", async () => {
		const response = await server.ask({
			"X-Forwarded-For": "198.51.100.7",
			"X-Sora-Client-Key": webClientKey,
		});

		expect(await response.text()).toBe("198.51.100.7");
	});

	test("preserves a chain the web app reports", async () => {
		const response = await server.ask({
			"X-Forwarded-For": "198.51.100.7, 10.0.0.2",
			"X-Sora-Client-Key": webClientKey,
		});

		expect(await response.text()).toBe("198.51.100.7, 10.0.0.2");
	});
});
