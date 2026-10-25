import { describe, expect, test } from "bun:test";

import { day, formatRetryAfter, hour, minute, parseRetryAfter, second } from "./time";

describe("durations", () => {
	test("are milliseconds", () => {
		expect(second).toBe(1000);
		expect(minute).toBe(60_000);
		expect(hour).toBe(3_600_000);
		expect(day).toBe(86_400_000);
	});
});

describe("parseRetryAfter", () => {
	const now = Date.parse("2026-10-15T12:00:00Z");

	test("reads seconds", () => {
		expect(parseRetryAfter("30", now)).toBe(30_000);
		expect(parseRetryAfter("0", now)).toBe(0);
	});

	test("reads an HTTP date", () => {
		expect(parseRetryAfter("Thu, 15 Oct 2026 12:01:00 GMT", now)).toBe(60_000);
		expect(parseRetryAfter("Thu, 15 Oct 2026 11:00:00 GMT", now)).toBe(0);
	});

	test("returns null when absent or unreadable", () => {
		expect(parseRetryAfter(null, now)).toBeNull();
		expect(parseRetryAfter("", now)).toBeNull();
		expect(parseRetryAfter("soon", now)).toBeNull();
		expect(parseRetryAfter("-5", now)).toBeNull();
	});
});

describe("formatRetryAfter", () => {
	test("rounds up to whole seconds", () => {
		expect(formatRetryAfter(1001)).toBe("2");
		expect(formatRetryAfter(30_000)).toBe("30");
	});
});
