import { describe, expect, test } from "bun:test";

import { parseTmdbHints } from "./hints";

describe("parseTmdbHints", () => {
	test("reads the show and films hinted for each AniList entry", () => {
		const hints = parseTmdbHints([
			{
				anidb_id: 17617,
				anilist_id: 154587,
				mal_id: 52991,
				season: {
					tmdb: 1,
					tvdb: 1,
				},
				themoviedb_id: {
					tv: 209867,
				},
				type: "TV",
			},
			{
				anidb_id: 7,
				anilist_id: 164,
				themoviedb_id: {
					movie: [128],
				},
				type: "MOVIE",
			},
		]);

		expect([...hints]).toEqual([
			[
				154_587,
				{
					movieIds: [],
					showId: 209867,
				},
			],
			[
				164,
				{
					movieIds: [128],
					showId: null,
				},
			],
		]);
	});

	test("skips entries without an AniList ID or TMDB IDs, and malformed ones", () => {
		const hints = parseTmdbHints([
			{
				anidb_id: 1,
				themoviedb_id: {
					tv: 26_209,
				},
			},
			{
				anilist_id: 290,
			},
			{
				anilist_id: 291,
				themoviedb_id: {},
			},
			{
				anilist_id: "292",
				themoviedb_id: {
					tv: 1,
				},
			},
			{
				anilist_id: 293,
				themoviedb_id: {
					tv: "movie",
				},
			},
			null,
		]);

		expect(hints.size).toBe(0);
	});

	test("merges entries that share an AniList ID", () => {
		const hints = parseTmdbHints([
			{
				anilist_id: 1,
				themoviedb_id: {
					movie: [20],
					tv: 10,
				},
			},
			{
				anilist_id: 1,
				themoviedb_id: {
					movie: [20, 21],
					tv: 11,
				},
			},
		]);

		expect(hints.get(1)).toEqual({
			movieIds: [20, 21],
			showId: 10,
		});
	});

	test("rejects a list that is not an array", () => {
		expect(() =>
			parseTmdbHints({
				entries: [],
			}),
		).toThrow(TypeError);
	});
});
