import { describe, expect, test } from "bun:test";

import { InvalidStreamTokenError } from "../../errors";
import { fetchUpstream, readBounded, StreamUpstreamError } from "./upstream";

function target(url: string) {
	return {
		accountId: "account",
		expiresAt: Math.floor(Date.now() / 1_000) + 60,
		headers: {},
		kind: "file" as const,
		mirrors: [],
		url,
	};
}

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

describe("readBounded", () => {
	test("reads a body that fits", async () => {
		const bytes = await readBounded(new Response("hello"), 5);
		expect(new TextDecoder().decode(bytes)).toBe("hello");
	});

	test("reads an empty body", async () => {
		expect((await readBounded(new Response(null), 10)).byteLength).toBe(0);
	});

	test("refuses a body that announces more than the limit", async () => {
		const response = new Response("hello", {
			headers: {
				"Content-Length": "5",
			},
		});
		await expect(readBounded(response, 4)).rejects.toBeInstanceOf(StreamUpstreamError);
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
