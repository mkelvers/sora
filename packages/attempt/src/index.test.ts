import { describe, expect, test } from "bun:test";

import { attempt } from "./index";

class NotFound extends Error {}

describe("attempt", () => {
	test("gives the value of a promise that resolves", async () => {
		expect(await attempt(Promise.resolve(1))).toEqual({
			data: 1,
			error: null,
		});
	});

	test("gives the error of a promise that rejects", async () => {
		const cause = new TypeError("down");
		expect(await attempt(Promise.reject(cause))).toEqual({
			data: null,
			error: cause,
		});
	});

	test("gives the error of a synchronous throw", () => {
		const { error } = attempt(() => JSON.parse("{"));
		expect(error).toBeInstanceOf(SyntaxError);
	});

	test("gives back only the error classes named", async () => {
		const { error } = await attempt(Promise.reject(new NotFound()), NotFound, RangeError);
		const typed: NotFound | RangeError | null = error;
		expect(typed).toBeInstanceOf(NotFound);
	});

	test("rejects with an error of a class not named", async () => {
		const unexpected = new TypeError("bug");
		await expect(attempt(Promise.reject(unexpected), NotFound)).rejects.toBe(unexpected);
		expect(() =>
			attempt(() => {
				throw unexpected;
			}, NotFound),
		).toThrow(unexpected);
	});

	test("wraps a thrown value that is not an Error", async () => {
		const { error } = await attempt(Promise.reject("nope"));
		expect(error?.message).toBe("nope");
		expect(error?.cause).toBe("nope");
	});

	test("narrows data once error is ruled out", async () => {
		const { data, error } = await attempt(Promise.resolve("value"));
		if (error) {
			throw error;
		}
		const length: number = data.length;
		expect(length).toBe(5);
	});
});
