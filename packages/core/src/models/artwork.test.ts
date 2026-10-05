import { describe, expect, test } from "bun:test";

import { ArtworkChangesSchema } from "./series";

describe("ArtworkChangesSchema", () => {
	test.each(["https://image.tmdb.org/t/p/w500/a.png", "https://s4.anilist.co/file/a.jpg"])(
		"accepts %s",
		(url) => {
			expect(
				ArtworkChangesSchema.safeParse({
					logo_url: url,
				}).success,
			).toBe(true);
		},
	);

	test.each([
		"https://evil.example/pixel.png",
		"https://image.tmdb.org.evil.example/a.png",
		"https://user@evil.example/a.png",
		"http://image.tmdb.org/a.png",
		"javascript:alert(1)",
	])("rejects %s", (url) => {
		expect(
			ArtworkChangesSchema.safeParse({
				poster_url: url,
			}).success,
		).toBe(false);
	});

	test("still takes false and null", () => {
		expect(
			ArtworkChangesSchema.safeParse({
				backdrop_url: false,
				logo_url: null,
			}).success,
		).toBe(true);
	});
});
