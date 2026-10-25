import { describe, expect, test } from "bun:test";

import { firstInSequence, inSequence } from "./sequence";

describe("inSequence", () => {
	test("starts each item once the one before it has finished, and keeps the order", async () => {
		const started: number[] = [];
		const finished: number[] = [];

		const results = await inSequence([30, 10, 20], async (delay, index) => {
			started.push(index);
			await Bun.sleep(delay);
			finished.push(index);
			return delay * 2;
		});

		expect(results).toEqual([60, 20, 40]);
		expect(started).toEqual([0, 1, 2]);
		expect(finished).toEqual([0, 1, 2]);
	});

	test("resolves to nothing for no items", async () => {
		expect(await inSequence([], () => Promise.resolve(1))).toEqual([]);
	});

	test("stops at the first rejection", async () => {
		const seen: number[] = [];
		const run = inSequence([1, 2, 3], (item) => {
			seen.push(item);
			return item === 2 ? Promise.reject(new RangeError("two")) : Promise.resolve(item);
		});

		await expect(run).rejects.toThrow("two");
		expect(seen).toEqual([1, 2]);
	});

	test("takes tens of thousands of items", async () => {
		const items = Array.from({ length: 50_000 }, (_, index) => index);
		const results = await inSequence(items, (item) => Promise.resolve(item));
		expect(results).toHaveLength(50_000);
	});
});

describe("firstInSequence", () => {
	test("stops at the first item that gives a result", async () => {
		const seen: number[] = [];
		const found = await firstInSequence([1, 2, 3, 4], (item) => {
			seen.push(item);
			return Promise.resolve(item === 2 ? "two" : undefined);
		});

		expect(found).toBe("two");
		expect(seen).toEqual([1, 2]);
	});

	test("resolves to undefined when none gives a result", async () => {
		expect(await firstInSequence([1, 2], () => Promise.resolve(undefined))).toBeUndefined();
	});
});
