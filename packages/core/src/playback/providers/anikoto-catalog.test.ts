import { describe, expect, test } from "bun:test";

import { animeWith, format, frieren, series } from "./anikoto-catalog.fixture";
import { Search, strictTitle } from "./search";
import { Series } from "./series";

describe("Series.row", () => {
	test("reads IDs, format, and every title", () => {
		expect(new Series(frieren).row).toEqual({
			anikotoId: 6351,
			anilistId: 154_587,
			episodes: 28,
			format: "TV",
			malId: 52_991,
			rating: "PG-13",
			title: "Frieren: Beyond Journey's End",
			titles: ["Frieren: Beyond Journey's End", "Sousou no Frieren", "葬送のフリーレン"],
			updatedAt: new Date("2024-10-18T09:15:13Z"),
			year: 2023,
		});
	});

	test("reads AniKoto's empty strings as unknown", () => {
		expect(
			new Series({
				...frieren,
				ani_id: "",
				episodes: "",
				rating: "",
				year: null,
			}).row,
		).toMatchObject({
			anilistId: null,
			episodes: null,
			rating: null,
			year: null,
		});
		expect(
			new Series({
				...frieren,
				rating: "None",
			}).row?.rating,
		).toBeNull();
	});

	test("maps AniKoto's types to AniList formats", () => {
		expect(format("Movie")).toBe("MOVIE");
		expect(format("TV Special")).toBe("SPECIAL");
		expect(format("TV_SHORT")).toBe("TV_SHORT");
		expect(format("Something new")).toBeNull();
	});

	test("keeps a title with a comma whole as well as split", () => {
		const titles = new Series({
			...frieren,
			titles: "Katainaka no Ossan, Kensei ni Naru, 片田舎のおっさん、剣聖になる",
		}).row?.titles;

		expect(titles).toContain("Katainaka no Ossan, Kensei ni Naru, 片田舎のおっさん、剣聖になる");
		expect(titles).toContain("Katainaka no Ossan");
		expect(titles).toContain("片田舎のおっさん、剣聖になる");
	});

	test("rejects a series without a title or change date", () => {
		expect(
			new Series({
				...frieren,
				title: "",
			}).row,
		).toBeNull();
		expect(
			new Series({
				...frieren,
				updated_at: "yesterday",
			}).row,
		).toBeNull();
	});
});

describe("Search.best", () => {
	test("passes over a film that carries its show's IDs, as for Demon Slayer", () => {
		// AniKoto files Sibling's Bond, a compilation film, under the show's
		// AniList and MyAnimeList IDs; the show itself has only the latter.
		const show = series({
			anikotoId: 1551,
			episodes: 26,
			format: "TV",
			malId: 38_000,
			title: "Demon Slayer: Kimetsu no Yaiba",
			titles: ["Demon Slayer: Kimetsu no Yaiba", "Kimetsu no Yaiba"],
			year: 2019,
		});

		const film = series({
			anikotoId: 6780,
			anilistId: 101_922,
			format: "MOVIE",
			malId: 38_000,
			title: "Demon Slayer: Sibling's Bond",
			titles: ["Demon Slayer: Sibling's Bond", "Kimetsu no Yaiba Kyōdai no Kizuna"],
			year: 2019,
		});

		expect(
			new Search(
				animeWith({
					episodes: 26,
					format: "TV",
					id: 101_922,
					malId: 38_000,
					seasonYear: 2019,
					title: {
						display: "Demon Slayer: Kimetsu no Yaiba",
						english: "Demon Slayer: Kimetsu no Yaiba",
						native: "鬼滅の刃",
						romaji: "Kimetsu no Yaiba",
					},
				}),
			).best([film, show])?.anikotoId,
		).toBe(1551);
	});

	test("trusts a matching MyAnimeList ID over AniKoto's wrong AniList ID, as for DAN DA DAN", () => {
		const dandadan = series({
			anikotoId: 4,
			anilistId: 132_029,
			episodes: 12,
			format: "TV",
			malId: 57_334,
			title: "Dandadan",
			year: 2024,
		});

		expect(
			new Search(
				animeWith({
					episodes: 12,
					format: "TV",
					id: 171_018,
					malId: 57_334,
					seasonYear: 2024,
				}),
			).best([dandadan])?.anikotoId,
		).toBe(4);
	});

	test("prefers the broadcast cut to an uncensored copy", () => {
		const shared = {
			episodes: 12,
			format: "TV",
			malId: 51_705,
			year: 2023,
		};

		expect(
			new Search(
				animeWith({
					episodes: 12,
					format: "TV",
					id: 153_930,
					malId: 51_705,
					seasonYear: 2023,
				}),
			).best([
				series({
					anikotoId: 6593,
					title: "Love Flops (Uncensored)",
					...shared,
				}),
				series({
					anikotoId: 7144,
					title: "Love Flops",
					...shared,
				}),
			])?.anikotoId,
		).toBe(7144);
	});

	test("never matches a film to a show", () => {
		expect(
			new Search(
				animeWith({
					format: "MOVIE",
					id: 195_200,
					malId: 62_546,
				}),
			).best([
				series({
					anikotoId: 1,
					format: "TV",
					malId: 62_546,
					title: "Demon Slayer: Kimetsu no Yaiba",
				}),
			]),
		).toBeNull();
	});

	test("accepts a web series AniKoto lists as TV", () => {
		expect(
			new Search(
				animeWith({
					format: "ONA",
					id: 177_709,
					malId: 58_939,
				}),
			).best([
				series({
					anikotoId: 7498,
					format: "TV",
					malId: 58_939,
					title: "Sakamoto Days",
				}),
			])?.anikotoId,
		).toBe(7498);
	});
});

describe("strictTitle", () => {
	test("keeps season numbers, so a sequel never equals its first season", () => {
		expect(strictTitle("Katainaka no Ossan, Kensei ni Naru II")).not.toBe(
			strictTitle("Katainaka no Ossan, Kensei ni Naru"),
		);
		expect(strictTitle("Grand Blue Season 4")).not.toBe(strictTitle("Grand Blue Season 2"));
	});

	test("ignores case, punctuation, and accents", () => {
		expect(strictTitle("Re:ZERO -Starting Life-")).toBe("re zero starting life");
		expect(strictTitle("Pokémon")).toBe(strictTitle("Pokemon"));
	});
});
