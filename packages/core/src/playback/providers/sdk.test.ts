import { describe, expect, test } from "bun:test";

import type { Anime } from "../../catalog/models/anime";
import { acceptsTitleMatch } from "./sdk";

const titan = {
	title: {
		english: "Attack on Titan Season 2",
		romaji: "Shingeki no Kyojin 2",
		native: null,
	},
	synonyms: [],
	episodes: 12,
	status: "FINISHED",
} as unknown as Anime;

describe("acceptsTitleMatch", () => {
	test("takes the same season with about the same episodes", () => {
		expect(acceptsTitleMatch(titan, "Attack on Titan Season 2", 12)).toBe(true);
		expect(acceptsTitleMatch(titan, "Attack on Titan Season 2", 14)).toBe(true);
	});

	test("refuses another season however alike the title is", () => {
		expect(acceptsTitleMatch(titan, "Attack on Titan Season 3", 12)).toBe(false);
		expect(acceptsTitleMatch(titan, "Attack on Titan", 25)).toBe(false);
	});

	test("refuses a finished anime's series of the wrong length", () => {
		expect(acceptsTitleMatch(titan, "Attack on Titan Season 2", 25)).toBe(false);
		expect(acceptsTitleMatch(titan, "Attack on Titan Season 2", 4)).toBe(false);
	});

	test("lets an airing anime's series have fewer episodes so far", () => {
		const airing = {
			...titan,
			status: "RELEASING",
		} as Anime;
		expect(acceptsTitleMatch(airing, "Attack on Titan Season 2", 5)).toBe(true);
		expect(acceptsTitleMatch(airing, "Attack on Titan Season 2", 25)).toBe(false);
	});

	test("lets a paused or cancelled anime's series have fewer episodes", () => {
		for (const status of ["HIATUS", "CANCELLED"]) {
			const unfinished = {
				...titan,
				episodes: 24,
				status,
			} as Anime;
			expect(acceptsTitleMatch(unfinished, "Attack on Titan Season 2", 10)).toBe(true);
			expect(acceptsTitleMatch(unfinished, "Attack on Titan Season 2", 40)).toBe(false);
		}
	});

	test("takes any length when AniList does not know the count", () => {
		const unknown = {
			...titan,
			episodes: null,
		} as Anime;
		expect(acceptsTitleMatch(unknown, "Attack on Titan Season 2", 300)).toBe(true);
	});
});
