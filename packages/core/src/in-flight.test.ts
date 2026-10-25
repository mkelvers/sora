import { describe, expect, test } from "bun:test";

import { InFlight } from "./in-flight";

describe("InFlight", () => {
	test("shares one run between callers asking while it runs", async () => {
		const inFlight = new InFlight<string, number>();
		let starts = 0;
		const start = () => {
			starts += 1;
			return Promise.resolve(1);
		};

		const [first, second] = await Promise.all([inFlight.run("a", start), inFlight.run("a", start)]);

		expect([first, second, starts]).toEqual([1, 1, 1]);
	});

	test("starts afresh once a run has settled", async () => {
		const inFlight = new InFlight<string, number>();
		await inFlight.run("a", () => Promise.resolve(1));

		expect(inFlight.has("a")).toBe(false);
		expect(await inFlight.run("a", () => Promise.resolve(2))).toBe(2);
	});

	test("forgets a run that failed", async () => {
		const inFlight = new InFlight<string, number>();
		const failure = new Error("down");

		await expect(inFlight.run("a", () => Promise.reject(failure))).rejects.toBe(failure);
		expect(inFlight.has("a")).toBe(false);
	});
});
