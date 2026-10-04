import { describe, expect, test } from "bun:test";

import { attempt } from "./index";

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

	test("catches a synchronous throw", () => {
		const { error } = attempt(() => JSON.parse("{"));
		expect(error).toBeInstanceOf(SyntaxError);
	});

	test("catches a throw before an async function's promise exists", async () => {
		const { error } = await attempt((): Promise<number> => {
			throw new RangeError("bad");
		});
		expect(error).toBeInstanceOf(RangeError);
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
