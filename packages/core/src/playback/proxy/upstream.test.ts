import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import http from "node:http";

import { InvalidStreamTokenError } from "../../errors";
import { readBounded } from "./hops";
import { canFetchStream } from "./proxy";
import { fetchTarget, readTarget } from "./upstream";
import { StreamUpstreamError } from "./upstream-error";

describe("fetchTarget", () => {
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
		const target = {
			accountId: "account",
			expiresAt: Math.floor(Date.now() / 1000) + 60,
			headers: {},
			kind: "file" as const,
			mirrors: [],
			url,
		};

		await expect(fetchTarget(target, null)).rejects.toBeInstanceOf(InvalidStreamTokenError);
	});
});

/** The local server that stands in for the public hosts. */
interface FakeHosts {
	server: ReturnType<typeof Bun.serve> | undefined;
}

const fake: FakeHosts = {
	server: undefined,
};

afterEach(async () => {
	await fake.server?.stop(true);
	fake.server = undefined;
	mock.restore();
});

/**
 * A public-looking host served by a local server that answers with `statuses`
 * in turn, the last one from then on. The upstream refuses private addresses,
 * so its requests are sent to the local server without that check.
 */
class ThrottlingHost {
	readonly #statuses: {
		status: number;
		retryAfter?: string;
	}[];

	#requests = 0;

	constructor(
		statuses: {
			status: number;
			retryAfter?: string;
		}[],
	) {
		this.#statuses = statuses;
	}

	/** How many requests reached the host. */
	get requests() {
		return this.#requests;
	}

	/** Starts serving every request to a public-looking host. */
	start() {
		const realRequest = http.request;

		fake.server = Bun.serve({
			fetch: () => this.#answer(),
			port: 0,
		});
		const local = fake.server.url;
		spyOn(http, "request").mockImplementation(
			(
				url: string | URL | http.RequestOptions,
				options?: http.RequestOptions | ((response: http.IncomingMessage) => void),
				onResponse?: (response: http.IncomingMessage) => void,
			) => {
				if (!(url instanceof URL)) {
					throw new TypeError("The stream request must pass a URL");
				}

				if (!options || !("headers" in options)) {
					throw new TypeError("The stream request must pass options with headers");
				}

				return realRequest(
					new URL(`${url.pathname}${url.search}`, local),
					{
						...options,
						lookup: undefined,
					},
					onResponse,
				);
			},
		);
	}

	#answer() {
		const answer = this.#statuses[Math.min(this.#requests, this.#statuses.length - 1)];
		this.#requests += 1;

		const headers = new Headers();
		let body = "Too many requests";

		if (answer?.retryAfter) {
			headers.set("Retry-After", answer.retryAfter);
		}

		if (answer?.status === 200) {
			body = "#EXTM3U\n";
		}

		return new Response(body, {
			headers,
			status: answer?.status,
		});
	}
}

const playlist = {
	accountId: "account",
	expiresAt: Math.floor(Date.now() / 1000) + 60,
	headers: {},
	kind: "playlist" as const,
	mirrors: [],
	url: "http://cdn.example.com/master.m3u8",
};

describe("a host that rate-limits", () => {
	test("is asked again once its Retry-After has passed", async () => {
		const host = new ThrottlingHost([
			{
				retryAfter: "1",
				status: 429,
			},
			{
				status: 200,
			},
		]);

		host.start();

		// As short as the check that a video host can be reached.
		const upstream = await fetchTarget(playlist, null, AbortSignal.timeout(3000));
		expect(await upstream.response.text()).toBe("#EXTM3U\n");
		expect(host.requests).toBe(2);
	});

	test("is asked again when a playlist is read whole", async () => {
		const host = new ThrottlingHost([
			{
				retryAfter: "1",
				status: 429,
			},
			{
				status: 200,
			},
		]);

		host.start();

		const upstream = await readTarget(playlist);
		expect(new TextDecoder().decode(upstream.bytes)).toBe("#EXTM3U\n");
		expect(host.requests).toBe(2);
	});

	test("fails at once when Retry-After asks for longer than playback waits", async () => {
		const host = new ThrottlingHost([
			{
				retryAfter: "120",
				status: 429,
			},
		]);

		host.start();

		const started = Date.now();
		const failure = await fetchTarget(playlist, null).catch((error: Error) => error);
		expect(failure).toBeInstanceOf(StreamUpstreamError);
		expect(failure).toMatchObject({
			status: 429,
		});
		expect(Date.now() - started).toBeLessThan(1000);
		expect(host.requests).toBe(1);
	});

	test("fails when the caller stops waiting before Retry-After passes", async () => {
		const host = new ThrottlingHost([
			{
				retryAfter: "2",
				status: 429,
			},
		]);

		host.start();

		const started = Date.now();

		const failure = await fetchTarget(playlist, null, AbortSignal.timeout(500)).catch(
			(error: Error) => error,
		);

		expect(failure).toMatchObject({
			status: 429,
		});
		expect(Date.now() - started).toBeLessThan(1500);
	});

	test.each(["10", "2"])(
		"counts as reachable while it throttles with Retry-After %s",
		async (retryAfter) => {
			const host = new ThrottlingHost([
				{
					retryAfter,
					status: 429,
				},
			]);

			host.start();

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
