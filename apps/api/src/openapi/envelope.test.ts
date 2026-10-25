import { describe, expect, test } from "bun:test";

import { pageMeta } from "./envelope";

describe("pageMeta", () => {
	test("links the pages either side, keeping the query", () => {
		expect(
			pageMeta("https://api.example/v1/search?q=frieren&per_page=10&page=2", {
				hasNextPage: true,
				isPreparing: false,
				page: 2,
				perPage: 10,
			}),
		).toEqual({
			has_next_page: true,
			next: "/v1/search?q=frieren&per_page=10&page=3",
			page: 2,
			per_page: 10,
			preparing: false,
			preparing_titles: [],
			previous: "/v1/search?q=frieren&per_page=10&page=1",
		});
	});

	test("has no previous page on the first, and no next on the last", () => {
		const meta = pageMeta("https://api.example/v1/series", {
			hasNextPage: false,
			isPreparing: true,
			page: 1,
			perPage: 24,
		});

		expect(meta.next).toBeNull();
		expect(meta.previous).toBeNull();
		expect(meta.preparing).toBe(true);
	});

	test("lists the titles being prepared, where they are expected", () => {
		const meta = pageMeta("https://api.example/v1/search?q=insomniacs", {
			hasNextPage: false,
			isPreparing: true,
			page: 1,
			perPage: 24,
			preparing: [
				{
					anilist_id: 143653,
					format: "TV",
					position: 0,
					title: "Insomniacs After School",
					year: 2023,
				},
			],
		});

		expect(meta.preparing_titles).toEqual([
			{
				anilist_id: 143_653,
				format: "TV",
				position: 0,
				title: "Insomniacs After School",
				year: 2023,
			},
		]);
	});
});
