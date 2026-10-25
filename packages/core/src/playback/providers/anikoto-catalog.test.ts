import { describe, expect, test } from "bun:test";

import type { Anime } from "../../catalog/models/anime";
import { anime } from "../../catalog/models/anime.fixture";
import { bestIdMatch, parseCatalogSeries, strictTitle } from "./anikoto-catalog";

/** Frieren as AniKoto's catalogue listing sends it. */
const frieren = {
	alternative: "Sousou no Frieren",
	ani_id: "154587",
	episodes: "28",
	id: 6351,
	mal_id: "52991",
	native: "葬送のフリーレン",
	terms_by_type: {
		type: ["TV"],
	},
	title: "Frieren: Beyond Journey's End",
	titles: "Frieren: Beyond Journey's End",
	updated_at: "2024-10-18 09:15:13",
	year: 2023,
};

/** An AniList entry with what matching reads; the rest is left blank. */
const animeWith = (fields: Partial<Anime> & Pick<Anime, "id" | "malId" | "format">): Anime => ({
	...anime(fields.id),
	status: "FINISHED",
	...fields,
});

/** A stored AniKoto series, as the mirror holds it. */
const series = (
	fields: Partial<NonNullable<ReturnType<typeof parseCatalogSeries>>> & {
		anikotoId: number;
		title: string;
	},
) => ({
	anilistId: null,
	episodes: null,
	format: null,
	malId: null,
	titles: [fields.title],
	updatedAt: new Date(0),
	year: null,
	...fields,
});

describe("parseCatalogSeries", () => {
	test("reads IDs, format, and every title", () => {
		expect(parseCatalogSeries(frieren)).toEqual({
			anikotoId: 6351,
			anilistId: 154_587,
			episodes: 28,
			format: "TV",
			malId: 52_991,
			title: "Frieren: Beyond Journey's End",
			titles: ["Frieren: Beyond Journey's End", "Sousou no Frieren", "葬送のフリーレン"],
			updatedAt: new Date("2024-10-18T09:15:13Z"),
			year: 2023,
		});
	});

	test("reads AniKoto's empty strings as unknown", () => {
		expect(
			parseCatalogSeries({
				...frieren,
				ani_id: "",
				episodes: "",
				year: null,
			}),
		).toMatchObject({
			anilistId: null,
			episodes: null,
			year: null,
		});
	});

	test("maps AniKoto's types to AniList formats", () => {
		const format = (type: string) =>
			parseCatalogSeries({
				...frieren,
				terms_by_type: {
					type: [type],
				},
			})?.format;

		expect(format("Movie")).toBe("MOVIE");
		expect(format("TV Special")).toBe("SPECIAL");
		expect(format("TV_SHORT")).toBe("TV_SHORT");
		expect(format("Something new")).toBeNull();
	});

	test("keeps a title with a comma whole as well as split", () => {
		const titles = parseCatalogSeries({
			...frieren,
			titles: "Katainaka no Ossan, Kensei ni Naru, 片田舎のおっさん、剣聖になる",
		})?.titles;

		expect(titles).toContain("Katainaka no Ossan, Kensei ni Naru, 片田舎のおっさん、剣聖になる");
		expect(titles).toContain("Katainaka no Ossan");
		expect(titles).toContain("片田舎のおっさん、剣聖になる");
	});

	test("rejects a series without a title or change date", () => {
		expect(
			parseCatalogSeries({
				...frieren,
				title: "",
			}),
		).toBeNull();
		expect(
			parseCatalogSeries({
				...frieren,
				updated_at: "yesterday",
			}),
		).toBeNull();
	});
});

describe("bestIdMatch", () => {
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
			bestIdMatch(
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
				[film, show],
			)?.anikotoId,
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
			bestIdMatch(
				animeWith({
					episodes: 12,
					format: "TV",
					id: 171_018,
					malId: 57_334,
					seasonYear: 2024,
				}),
				[dandadan],
			)?.anikotoId,
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
			bestIdMatch(
				animeWith({
					episodes: 12,
					format: "TV",
					id: 153_930,
					malId: 51_705,
					seasonYear: 2023,
				}),
				[
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
				],
			)?.anikotoId,
		).toBe(7144);
	});

	test("never matches a film to a show", () => {
		expect(
			bestIdMatch(
				animeWith({
					format: "MOVIE",
					id: 195_200,
					malId: 62_546,
				}),
				[
					series({
						anikotoId: 1,
						format: "TV",
						malId: 62_546,
						title: "Demon Slayer: Kimetsu no Yaiba",
					}),
				],
			),
		).toBeNull();
	});

	test("accepts a web series AniKoto lists as TV", () => {
		expect(
			bestIdMatch(
				animeWith({
					format: "ONA",
					id: 177_709,
					malId: 58_939,
				}),
				[
					series({
						anikotoId: 7498,
						format: "TV",
						malId: 58_939,
						title: "Sakamoto Days",
					}),
				],
			)?.anikotoId,
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
