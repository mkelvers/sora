import { afterAll, describe, expect, test } from "bun:test";

import { HttpClient } from "anime-sdk";

import { transport } from "./transport";

const server = Bun.serve({
	fetch: (request) => {
		const retryAfter = new URL(request.url).searchParams.get("retry_after");

		if (retryAfter === null) {
			return new Response("ok");
		}

		return new Response("slow down", {
			headers: {
				"Retry-After": retryAfter,
			},
			status: 429,
		});
	},
	port: 0,
});

afterAll(() => server.stop(true));

describe("transport", () => {
	test("cuts a long Retry-After", async () => {
		const response = await transport.fetch(`${server.url}?retry_after=3600`, {});
		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("10");
		expect(await response.text()).toBe("slow down");
	});

	test("cuts a Retry-After given as a date", async () => {
		const date = new Date(Date.now() + 3_600_000).toUTCString();

		const response = await transport.fetch(
			`${server.url}?retry_after=${encodeURIComponent(date)}`,
			{},
		);

		expect(response.headers.get("Retry-After")).toBe("10");
	});

	test("leaves a short Retry-After and other responses alone", async () => {
		const short = await transport.fetch(`${server.url}?retry_after=2`, {});
		expect(short.headers.get("Retry-After")).toBe("2");

		const plain = await transport.fetch(String(server.url), {});
		expect(await plain.text()).toBe("ok");
	});

	test("does not run shell code from a URL when the request fails", async () => {
		const marker = `${import.meta.dir}/transport-injected.txt`;

		const http = new HttpClient({
			disableRateLimit: true,
			retry: false,
			timeoutMs: 3000,
			transport,
		});

		const failure = await http
			.get(`http://127.0.0.1:1/$(touch ${marker})`)
			.catch((error: Error) => error);

		expect(failure).toBeInstanceOf(Error);
		expect(await Bun.file(marker).exists()).toBe(false);
	});
});
