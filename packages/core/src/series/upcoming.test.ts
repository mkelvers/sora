import { describe, expect, test } from "bun:test";

import { startsSoon } from "./upcoming";

const now = new Date("2026-10-01T12:00:00Z");

describe("startsSoon", () => {
	test("counts a start from today to thirty days ahead", () => {
		expect(startsSoon("2026-10-01", now)).toBe(true);
		expect(startsSoon("2026-10-03", now)).toBe(true);
		expect(startsSoon("2026-10-31", now)).toBe(true);
	});

	test("leaves out what started already or starts later", () => {
		expect(startsSoon("2026-09-30", now)).toBe(false);
		expect(startsSoon("2026-11-01", now)).toBe(false);
	});

	test("leaves out a start whose day is not known", () => {
		expect(startsSoon("2026-10", now)).toBe(false);
		expect(startsSoon("2026", now)).toBe(false);
		expect(startsSoon(null, now)).toBe(false);
	});
});
