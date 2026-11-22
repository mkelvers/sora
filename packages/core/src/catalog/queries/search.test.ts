import { describe, expect, test } from "bun:test";

import {
	popularityWeight,
	rankCandidates,
	shortQueryPattern,
	textScore,
	titleScore,
} from "./search";
import { normalize, searchText } from "./titles";

/** An indexed entry with the fields ranking reads. */
class Entry {
	readonly anilistId: number;
	readonly english: string | null;
	readonly native: string | null;
	readonly popularity: number;
	readonly romaji: string | null;
	readonly synonyms: string[];

	constructor(
		anilistId: number,
		popularity: number,
		titles: {
			english?: string;
			romaji?: string;
			native?: string;
			synonyms?: string[];
		},
	) {
		this.anilistId = anilistId;
		this.english = titles.english ?? null;
		this.native = titles.native ?? null;
		this.popularity = popularity;
		this.romaji = titles.romaji ?? null;
		this.synonyms = titles.synonyms ?? [];
	}
}

// Titles and popularity as AniList lists them.
const kimetsu = new Entry(101_922, 1_000_000, {
	english: "Demon Slayer: Kimetsu no Yaiba",
	native: "鬼滅の刃",
	romaji: "Kimetsu no Yaiba",
});

const mugenTrain = new Entry(112_151, 420_000, {
	english: "Demon Slayer -Kimetsu no Yaiba- The Movie: Mugen Train",
	romaji: "Kimetsu no Yaiba Movie: Mugen Ressha-hen",
});

const onigiri = new Entry(21_612, 9026, {
	english: "Onigiri",
	native: "鬼斬",
	romaji: "Onigiri",
	synonyms: ["Demon Slayer", "Demon Cutter"],
});

const attackOnTitan = new Entry(16_498, 1_100_000, {
	english: "Attack on Titan",
	native: "進撃の巨人",
	romaji: "Shingeki no Kyojin",
	synonyms: ["AoT", "SnK"],
});

const jujutsuKaisen = new Entry(113_415, 900_000, {
	english: "JUJUTSU KAISEN",
	native: "呪術廻戦",
	romaji: "Jujutsu Kaisen",
	synonyms: ["JJK", "Sorcery Fight"],
});

describe("rankCandidates", () => {
	test("puts the famous show before an obscure title whose synonym is the query", () => {
		expect(rankCandidates("demon slayer", [onigiri, mugenTrain, kimetsu])[0]?.anilistId).toBe(
			101_922,
		);
	});

	test("still finds the obscure title by its own name", () => {
		expect(rankCandidates("onigiri", [kimetsu, onigiri])[0]?.anilistId).toBe(21_612);
	});

	test("puts a show before its film when both start with the query", () => {
		expect(
			rankCandidates("demon slayer kimetsu no yaiba", [mugenTrain, kimetsu])[0]?.anilistId,
		).toBe(101_922);
	});

	test("matches romaji, native, and English titles alike", () => {
		expect(rankCandidates("shingeki no kyojin", [jujutsuKaisen, attackOnTitan])[0]?.anilistId).toBe(
			16_498,
		);
		expect(rankCandidates("進撃の巨人", [jujutsuKaisen, attackOnTitan])[0]?.anilistId).toBe(16_498);
	});

	test("matches an abbreviation listed as a synonym", () => {
		expect(
			rankCandidates("jjk", [
				attackOnTitan,
				new Entry(131_573, 400_000, {
					english: "JUJUTSU KAISEN 0",
					romaji: "Jujutsu Kaisen 0: Jujutsu Kaisen Zero",
				}),
				jujutsuKaisen,
			])[0]?.anilistId,
		).toBe(113_415);
	});

	test("forgives a typo", () => {
		expect(rankCandidates("jujutsu kaisn", [attackOnTitan, jujutsuKaisen])[0]?.anilistId).toBe(
			113_415,
		);
		expect(rankCandidates("demon slayr", [onigiri, kimetsu])[0]?.anilistId).toBe(101_922);
	});

	test("finds the far more popular remake when both have the query as their title", () => {
		const original = new Entry(136, 135_064, {
			english: "Hunter x Hunter",
			romaji: "HUNTER×HUNTER",
		});

		const remake = new Entry(11_061, 843_439, {
			english: "Hunter x Hunter (2011)",
			romaji: "HUNTER×HUNTER (2011)",
		});

		expect(rankCandidates("hunter x hunter", [original, remake])[0]?.anilistId).toBe(11_061);
	});

	test("finds a title by its full name, disambiguator included, as with Oreimo 2 (ONA)", () => {
		const ona = new Entry(18_857, 38_944, {
			english: "Oreimo 2 (ONA)",
			romaji: "Ore no Imouto ga Konna ni Kawaii Wake ga Nai. (ONA)",
		});

		const season = new Entry(13_659, 90_000, {
			english: "Oreimo 2",
			romaji: "Ore no Imouto ga Konna ni Kawaii Wake ga Nai.",
		});

		expect(textScore(normalize("Oreimo 2 (ONA)"), ona)).toBe(1);
		expect(rankCandidates("oreimo 2 ona", [season, ona])[0]?.anilistId).toBe(18_857);
	});

	test("still finds a title by its name without the disambiguator", () => {
		const remake = new Entry(11_061, 843_439, {
			english: "Hunter x Hunter (2011)",
		});

		expect(textScore(normalize("hunter x hunter"), remake)).toBe(1);
		expect(textScore(normalize("hunter x hunter 2011"), remake)).toBe(1);
	});

	test("lets a far more popular show that contains the query beat a film that starts with it", () => {
		const evangelion = new Entry(30, 496_647, {
			english: "Neon Genesis Evangelion",
			romaji: "Shin Seiki Evangelion",
		});

		const rebuild = new Entry(2759, 145_336, {
			english: "Evangelion: 1.0 You Are (Not) Alone",
			romaji: "Evangelion Shin Movie: Jo",
		});

		expect(rankCandidates("evangelion", [rebuild, evangelion])[0]?.anilistId).toBe(30);
	});

	test("still prefers an exact title to a slightly more popular sequel", () => {
		const clannad = new Entry(2167, 300_000, {
			english: "Clannad",
			romaji: "CLANNAD",
		});

		const afterStory = new Entry(4181, 350_000, {
			english: "Clannad: After Story",
			romaji: "CLANNAD: AFTER STORY",
		});

		expect(rankCandidates("clannad", [afterStory, clannad])[0]?.anilistId).toBe(2167);
	});

	test("ignores punctuation and spacing", () => {
		const reZero = new Entry(21_355, 700_000, {
			english: "Re:ZERO -Starting Life in Another World-",
			romaji: "Re:Zero kara Hajimeru Isekai Seikatsu",
		});

		expect(rankCandidates("re zero", [onigiri, reZero])[0]?.anilistId).toBe(21_355);
		expect(rankCandidates("rezero", [onigiri, reZero])[0]?.anilistId).not.toBe(21_612);
	});
});

describe("titleScore", () => {
	test("ranks an exact title over a prefix, a prefix over contained words, and those over a resemblance", () => {
		const exact = titleScore("one piece", "one piece");
		const prefix = titleScore("one piece", "one piece film red");
		const words = titleScore("one piece", "the one piece");
		const resembling = titleScore("one peice", "one piece");

		expect(exact).toBe(1);
		expect(prefix).toBeLessThan(exact);
		expect(words).toBeLessThan(prefix);
		expect(resembling).toBeLessThan(words);
		expect(resembling).toBeGreaterThan(0.4);
	});

	test("does not take a word that merely shares letters with the query for a typo", () => {
		expect(titleScore("frieren", "one piece episode of merry the tale of one more friend")).toBe(0);
		expect(titleScore("frieren", "my deer friend nokotan")).toBe(0);
		expect(titleScore("frieran", "sousou no frieren")).toBeGreaterThan(0.5);
	});

	test("matches initials of a title of several words", () => {
		expect(titleScore("aot", "attack on titan")).toBe(0.85);
		expect(titleScore("aot", "attack")).toBeLessThan(0.85);
	});
});

describe("popularityWeight", () => {
	test("grows with popularity, from 0.4 to 1", () => {
		expect(popularityWeight(0)).toBe(0.4);
		expect(popularityWeight(9026)).toBeLessThan(popularityWeight(1_000_000));
		expect(popularityWeight(5_000_000)).toBe(1);
	});
});

describe("normalize", () => {
	test("drops accents and punctuation and reads × as x", () => {
		expect(normalize("Pokémon")).toBe("pokemon");
		expect(normalize("SPY×FAMILY")).toBe("spy x family");
		expect(normalize("Steins;Gate")).toBe("steins gate");
	});
});

describe("searchText", () => {
	test("holds every distinct title and the initials of the longer ones", () => {
		expect(searchText(["Attack on Titan", "Shingeki no Kyojin", "Attack on Titan", null])).toBe(
			"attack on titan | shingeki no kyojin | aot | snk",
		);
	});

	test("holds the initials of a title without its disambiguator too", () => {
		expect(searchText(["ONE PIECE (Movie)"])).toBe("one piece movie | opm | op");
	});
});

describe("shortQueryPattern", () => {
	test("matches a whole word or initials of the search text", () => {
		expect(new RegExp(shortQueryPattern("op"), "u").test("one piece movie | opm | op")).toBe(true);
		expect(new RegExp(shortQueryPattern("k"), "u").test("k on | ko")).toBe(true);
	});

	test("matches two words run together", () => {
		expect(new RegExp(shortQueryPattern("ko"), "u").test("k on x | kox")).toBe(false);
		expect(new RegExp(shortQueryPattern("kx"), "u").test("k x")).toBe(true);
	});

	test("does not match part of a word", () => {
		expect(
			new RegExp(shortQueryPattern("fr"), "u").test("frieren beyond journey s end | fbjse"),
		).toBe(false);
	});
});
