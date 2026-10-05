import { describe, expect, test } from "bun:test";

import { InvalidStreamTokenError } from "../../errors";
import { fetchUpstream } from "./upstream";

function target(url: string) {
	return {
		url,
		kind: "file" as const,
		headers: {},
		mirrors: [],
		expiresAt: Math.floor(Date.now() / 1_000) + 60,
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
