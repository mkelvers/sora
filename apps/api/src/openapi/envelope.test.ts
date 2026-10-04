import { describe, expect, test } from "bun:test";

import { pageMeta } from "./envelope";

describe("pageMeta", () => {
	test("links the pages either side, keeping the query", () => {
		expect(
			pageMeta("https://api.example/v1/search?q=frieren&per_page=10&page=2", {
				page: 2,
				perPage: 10,
				hasNextPage: true,
				isPreparing: false,
			}),
		).toEqual({
			page: 2,
			per_page: 10,
			has_next_page: true,
			next: "/v1/search?q=frieren&per_page=10&page=3",
			previous: "/v1/search?q=frieren&per_page=10&page=1",
			preparing: false,
			preparing_titles: [],
		});
	});

	test("has no previous page on the first, and no next on the last", () => {
		const meta = pageMeta("https://api.example/v1/series", {
			page: 1,
			perPage: 24,
			hasNextPage: false,
			isPreparing: true,
		});

		expect(meta.next).toBeNull();
		expect(meta.previous).toBeNull();
		expect(meta.preparing).toBe(true);
	});

	test("lists the titles being prepared, where they are expected", () => {
		const meta = pageMeta("https://api.example/v1/search?q=insomniacs", {
			page: 1,
			perPage: 24,
			hasNextPage: false,
			isPreparing: true,
			preparing: [
				{
					anilist_id: 143653,
					title: "Insomniacs After School",
					format: "TV",
					year: 2023,
					position: 0,
				},
			],
		});

		expect(meta.preparing_titles).toEqual([
			{
				anilist_id: 143653,
				title: "Insomniacs After School",
				format: "TV",
				year: 2023,
				position: 0,
			},
		]);
	});
});
