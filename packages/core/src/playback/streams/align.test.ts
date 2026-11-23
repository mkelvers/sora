import { describe, expect, test } from "bun:test";

import { defined } from "@sora/shared";

import { align, shiftTime } from "./align";
import { Encode } from "./align.fixture";

describe("align", () => {
	test("finds a constant offset", () => {
		const sub = new Encode(1).boundaries;

		const shifts = align(
			sub,
			sub.map((time) => time + 2.5),
		);

		expect(shifts).toHaveLength(1);
		expect(defined(defined(shifts)[0]).offset).toBeCloseTo(2.5, 2);
	});

	test("changes offset where the other encode adds footage", () => {
		const sub = new Encode(2).boundaries;
		const cut = defined(sub[150]);

		const dub = sub.map((time) => {
			if (time < cut) {
				return time - 1;
			}

			return time + 12.4;
		});

		const shifts = defined(align(sub, dub));

		expect(shifts.map((shift) => [shift.from, Math.round(shift.offset * 10) / 10])).toEqual([
			[0, -1],
			[cut, 12.4],
		]);
	});

	test("ignores a few stray boundaries", () => {
		const sub = new Encode(3).boundaries;

		const dub = sub.map((time, index) => {
			if (index === 100 || index === 101) {
				return time + 57;
			}

			return time;
		});

		expect(align(sub, dub)).toEqual([
			{
				from: 0,
				offset: 0,
			},
		]);
	});

	test("refuses encodes of different episodes", () => {
		expect(align(new Encode(4).boundaries, new Encode(5).boundaries)).toBeNull();
	});
});

describe("shiftTime", () => {
	test("moves a time by the shift it falls in", () => {
		const shifts = [
			{
				from: 0,
				offset: -1,
			},
			{
				from: 100,
				offset: 12,
			},
		];

		expect(shiftTime(shifts, 50)).toBe(49);
		expect(shiftTime(shifts, 150)).toBe(162);
	});
});
