import { afterEach, describe, expect, spyOn, test } from "bun:test";
import http from "node:http";

import { InvalidStreamTokenError } from "../../errors";
import { canFetchStream } from "./proxy";
import { fetchUpstream, fetchUpstreamBytes, readBounded, StreamUpstreamError } from "./upstream";

const target = (url: string) => ({
	accountId: "account",
	expiresAt: Math.floor(Date.now() / 1000) + 60,
	headers: {},
	kind: "file" as const,
	mirrors: [],
	url,
});

describe("fetchUpstream", () => {
	test.each([
		"http://localhost/x",
		"http://127.0.0.1/x",
		"http://10.0.0.5/x",
		"http://169.254.169.254/latest/meta-data",
		"http://192.168.1.45:3000/x",
		"http://198.18.0.1/x",
		"http://224.0.0.1/x",
		"http://[::1]/x",
		"http://[fe80::1]/x",
		"http://[fd00::1]/x",
		"http://[::ffff:127.0.0.1]/x",
		"ftp://example.com/x",
	])("refuses %s without fetching it", async (url) => {
		await expect(fetchUpstream(target(url), null)).rejects.toBeInstanceOf(InvalidStreamTokenError);
	});
});

const realRequest = http.request;
let server: ReturnType<typeof Bun.serve> | undefined;

afterEach(async () => {
	await server?.stop(true);
	server = undefined;
	(http.request as unknown as { mockRestore?: () => void }).mockRestore?.();
});

/**
 * Serves every request to a public-looking host from a local server that
 * answers with `statuses` in turn, the last one from then on. The upstream
 * refuses private addresses, so its requests are sent to the local server
 * without that check.
 */
const throttlingHost = (statuses: { status: number; retryAfter?: string }[]) => {
	let requests = 0;
	server = Bun.serve({
		fetch: () => {
			const answer = statuses[Math.min(requests, statuses.length - 1)];
			requests += 1;
			return new Response(answer?.status === 200 ? "#EXTM3U\n" : "Too many requests", {
				headers: answer?.retryAfter
					? {
							"Retry-After": answer.retryAfter,
						}
					: {},
				status: answer?.status,
			});
		},
		port: 0,
	});
	const local = server.url;
	spyOn(http, "request").mockImplementation(((
		url: URL,
		options: http.RequestOptions,
		onResponse: (response: http.IncomingMessage) => void,
	) =>
		realRequest(
			new URL(`${url.pathname}${url.search}`, local),
			{
				...options,
				lookup: undefined,
			},
			onResponse,
		)) as unknown as typeof http.request);

	return {
		requests: () => requests,
	};
};

const playlist = {
	...target("http://cdn.example.com/master.m3u8"),
	kind: "playlist" as const,
};

describe("a host that rate-limits", () => {
	test("is asked again once its Retry-After has passed", async () => {
		const host = throttlingHost([
			{
				retryAfter: "1",
				status: 429,
			},
			{
				status: 200,
			},
		]);

		// As short as the check that a video host can be reached.
		const upstream = await fetchUpstream(playlist, null, AbortSignal.timeout(3000));
		expect(await upstream.response.text()).toBe("#EXTM3U\n");
		expect(host.requests()).toBe(2);
	});

	test("is asked again when a playlist is read whole", async () => {
		const host = throttlingHost([
			{
				retryAfter: "1",
				status: 429,
			},
			{
				status: 200,
			},
		]);

		const upstream = await fetchUpstreamBytes(playlist);
		expect(new TextDecoder().decode(upstream.bytes)).toBe("#EXTM3U\n");
		expect(host.requests()).toBe(2);
	});

	test("fails at once when Retry-After asks for longer than playback waits", async () => {
		const host = throttlingHost([
			{
				retryAfter: "120",
				status: 429,
			},
		]);

		const started = Date.now();
		const failure = await fetchUpstream(playlist, null).catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(StreamUpstreamError);
		expect((failure as StreamUpstreamError).status).toBe(429);
		expect(Date.now() - started).toBeLessThan(1000);
		expect(host.requests()).toBe(1);
	});

	test("fails when the caller stops waiting before Retry-After passes", async () => {
		throttlingHost([
			{
				retryAfter: "2",
				status: 429,
			},
		]);

		const started = Date.now();
		const failure = await fetchUpstream(playlist, null, AbortSignal.timeout(500)).catch(
			(error: unknown) => error,
		);
		expect((failure as StreamUpstreamError).status).toBe(429);
		expect(Date.now() - started).toBeLessThan(1500);
	});

	test.each(["10", "2"])(
		"counts as reachable while it throttles with Retry-After %s",
		async (retryAfter) => {
			throttlingHost([
				{
					retryAfter,
					status: 429,
				},
			]);

			expect(await canFetchStream(playlist.url, {}, [], AbortSignal.timeout(500))).toBe(true);
		},
	);
});

describe("readBounded", () => {
	test("reads a body that fits", async () => {
		const bytes = await readBounded(new Response("hello"), 5);
		expect(new TextDecoder().decode(bytes)).toBe("hello");
	});

	test("reads an empty body", async () => {
		const body = await readBounded(new Response(null), 10);
		expect(body.byteLength).toBe(0);
	});

	test("refuses a body that announces more than the limit", async () => {
		const response = new Response("hello", {
			headers: {
				"Content-Length": "5",
			},
		});
		await expect(readBounded(response, 4)).rejects.toBeInstanceOf(StreamUpstreamError);
	});

	test("reports each arrival of bytes", async () => {
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(4));
				controller.enqueue(new Uint8Array(4));
				controller.enqueue(new Uint8Array(4));
				controller.close();
			},
		});
		let arrivals = 0;
		const bytes = await readBounded(new Response(body), 64, () => {
			arrivals += 1;
		});
		expect(bytes.byteLength).toBe(12);
		expect(arrivals).toBe(3);
	});

	test("stops reading a body that passes the limit without announcing it", async () => {
		let sent = 0;
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				sent += 1;
				controller.enqueue(new Uint8Array(1024));
			},
		});
		await expect(readBounded(new Response(body), 4096)).rejects.toBeInstanceOf(StreamUpstreamError);
		expect(sent).toBeLessThan(20);
	});
});
