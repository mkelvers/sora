import { describe, expect, test } from "bun:test";

import { withoutStrayEpisodes } from "./episodes";

const numbered = (...numbers: number[]) => numbers.map((number) => ({ number }));
const numbersOf = (units: readonly { number: number }[]) => units.map((unit) => unit.number);

const finished = (episodes: number | null) => ({
	episodes,
	status: "FINISHED" as const,
});

describe("withoutStrayEpisodes", () => {
	test("cuts off a stray episode far past a film's only one", () => {
		expect(numbersOf(withoutStrayEpisodes(numbered(1, 192), finished(1)))).toEqual([1]);
	});

	test("cuts off the stray and everything after it", () => {
		expect(numbersOf(withoutStrayEpisodes(numbered(1, 2, 3, 4, 89, 90, 91), finished(4)))).toEqual([
			1, 2, 3, 4,
		]);
	});

	test("keeps a list that runs on past the total without a jump", () => {
		expect(numbersOf(withoutStrayEpisodes(numbered(1, 2, 3, 4, 5, 6, 7), finished(4)))).toEqual([
			1, 2, 3, 4, 5, 6, 7,
		]);
		expect(
			withoutStrayEpisodes(numbered(...Array.from({ length: 161 }, (_, i) => i + 1)), finished(18)),
		).toHaveLength(161);
	});

	test("keeps parts of a film numbered past its total", () => {
		expect(numbersOf(withoutStrayEpisodes(numbered(1, 2), finished(1)))).toEqual([1, 2]);
	});

	test("leaves airing anime and anime of unknown length alone", () => {
		expect(
			withoutStrayEpisodes(numbered(1, 192), { episodes: 1, status: "RELEASING" }),
		).toHaveLength(2);
		expect(withoutStrayEpisodes(numbered(1, 192), finished(null))).toHaveLength(2);
	});
});
