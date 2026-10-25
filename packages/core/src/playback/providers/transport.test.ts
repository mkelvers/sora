import { afterAll, describe, expect, test } from "bun:test";

import { HttpClient } from "anime-sdk";

import { providerTransport } from "./transport";

const server = Bun.serve({
	fetch: (request) => {
		const retryAfter = new URL(request.url).searchParams.get("retry_after");
		return retryAfter === null
			? new Response("ok")
			: new Response("slow down", {
					status: 429,
					headers: {
						"Retry-After": retryAfter,
					},
				});
	},
	port: 0,
});

afterAll(() => server.stop(true));

describe("providerTransport", () => {
	test("cuts a long Retry-After", async () => {
		const response = await providerTransport.fetch(`${server.url}?retry_after=3600`, {});
		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("10");
		expect(await response.text()).toBe("slow down");
	});

	test("cuts a Retry-After given as a date", async () => {
		const date = new Date(Date.now() + 3_600_000).toUTCString();
		const response = await providerTransport.fetch(
			`${server.url}?retry_after=${encodeURIComponent(date)}`,
			{},
		);
		expect(response.headers.get("Retry-After")).toBe("10");
	});

	test("leaves a short Retry-After and other responses alone", async () => {
		const short = await providerTransport.fetch(`${server.url}?retry_after=2`, {});
		expect(short.headers.get("Retry-After")).toBe("2");

		const plain = await providerTransport.fetch(String(server.url), {});
		expect(await plain.text()).toBe("ok");
	});

	test("does not run shell code from a URL when the request fails", async () => {
		const marker = `${import.meta.dir}/transport-injected.txt`;
		const http = new HttpClient({
			disableRateLimit: true,
			retry: false,
			timeoutMs: 3_000,
			transport: providerTransport,
		});

		const failure = await http
			.get(`http://127.0.0.1:1/$(touch ${marker})`)
			.catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(Error);
		expect(await Bun.file(marker).exists()).toBe(false);
	});
});
