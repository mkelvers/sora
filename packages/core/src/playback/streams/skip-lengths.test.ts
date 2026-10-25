import { describe, expect, test } from "bun:test";

import { usualLength, withLength } from "./skip-lengths";

describe("usualLength", () => {
	test("is the length most episodes report", () => {
		expect(usualLength([89, 89, 89, 217])).toBe(89);
	});

	test("rounds to the second", () => {
		expect(usualLength([89.2, 88.8, 89, 120])).toBe(89);
	});

	test("is null with too few episodes", () => {
		expect(usualLength([89, 89])).toBeNull();
	});

	test("is the most common length without a majority", () => {
		expect(usualLength([91, 91, 89, 89, 91, 70])).toBe(91);
	});

	test("is null when two lengths tie for most", () => {
		expect(usualLength([89, 89, 91, 91])).toBeNull();
	});
});

describe("withLength", () => {
	const opening = {
		end: 217,
		kind: "opening",
		start: 128,
	} as const;

	test("cuts a segment that is longer than the usual length", () => {
		expect(withLength(opening, 61)).toEqual({
			...opening,
			end: 189,
		});
	});

	test("stretches a short segment", () => {
		expect(withLength(opening, 100)).toEqual({
			...opening,
			end: 228,
		});
	});

	test("brings a segment one second off to the usual length", () => {
		expect(withLength(opening, 90)).toEqual({
			...opening,
			end: 218,
		});
	});

	test("keeps a segment already at the usual length", () => {
		expect(withLength(opening, 89)).toBe(opening);
	});

	test("keeps a segment when no length is usual", () => {
		expect(withLength(opening, null)).toBe(opening);
	});
});
