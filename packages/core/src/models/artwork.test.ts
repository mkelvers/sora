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
		`${"java"}script:alert(1)`,
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

	test("accepts an upscaled backdrop only as a backdrop", () => {
		const path = "/api/backdrops/3f2c0c6e-6a0a-4d0b-9f0e-5a0c1d7b2e11";
		expect(
			ArtworkChangesSchema.safeParse({
				backdrop_url: path,
			}).success,
		).toBe(true);
		expect(
			ArtworkChangesSchema.safeParse({
				poster_url: path,
			}).success,
		).toBe(false);
		expect(
			ArtworkChangesSchema.safeParse({
				backdrop_url: "/api/backdrops/../../etc/passwd",
			}).success,
		).toBe(false);
	});
});
