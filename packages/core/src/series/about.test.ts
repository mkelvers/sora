import { describe, expect, test } from "bun:test";

import type { Anime } from "../catalog/models/anime";
import { anime } from "../catalog/models/anime.fixture";
import { aboutSeries } from "./about";
import type { AboutSources } from "./about";

const about = (fields: Partial<Omit<AboutSources, "anime">> & { anime?: Partial<Anime> } = {}) =>
	aboutSeries({
		ageRating: null,
		audio: [],
		awardReach: new Map(),
		awards: [],
		certification: null,
		descriptors: [],
		keywords: [],
		overview: null,
		seasonStarts: [],
		subtitles: [],
		...fields,
		anime: {
			...anime(16_498),
			...fields.anime,
		},
	});

const award = (name: string, year: number | null, won: boolean) => ({
	name,
	won,
	year,
});

describe("aboutSeries", () => {
	test("names the original language for a sub and English for a dub", () => {
		expect(about({ audio: ["dub", "sub"] }).audio_languages).toEqual(["Japanese", "English"]);
		expect(
			about({
				anime: {
					countryOfOrigin: "CN",
				},
				audio: ["sub"],
			}).audio_languages,
		).toEqual(["Chinese"]);
		expect(about({ audio: ["dub"] }).audio_languages).toEqual(["English"]);
	});

	test("lists subtitles English first, then by name, once each", () => {
		expect(
			about({
				subtitles: ["es-419", "pt-BR", "en", "ar", "es", "xx-unknown-tag-1"],
			}).subtitle_languages,
		).toEqual(["English", "Arabic", "Brazilian Portuguese", "Latin American Spanish", "Spanish"]);
	});

	test("words the awards a season was given oldest first, a year's nominations before its wins", () => {
		const awards = [
			award("Tokyo Anime Award", 2014, true),
			award("Crunchyroll Anime Awards", 2017, true),
			award("Japan Expo Awards", null, false),
			award("Tokyo Anime Award", 2014, false),
			award("Crunchyroll Anime Awards", 2018, true),
			award("Anime Trending Awards", 2013, true),
		];
		const season = (startDate: string, seasonStarts: number[]) =>
			about({
				anime: {
					startDate,
				},
				awards,
				seasonStarts,
			}).awards;

		expect(season("2013-04-07", [2017])).toEqual([
			"2013 Anime Trending Awards Winner",
			"2014 Tokyo Anime Award Nominee",
			"2014 Tokyo Anime Award Winner",
			"2017 Crunchyroll Anime Awards Winner",
			"Japan Expo Awards Nominee",
		]);
		expect(season("2017-04-01", [2013])).toEqual(["2018 Crunchyroll Anime Awards Winner"]);
		expect(season("2013-04-07", [])).toHaveLength(6);
	});

	test("rates by MyAnimeList, warning of what the rating and strong tags say", () => {
		expect(
			about({
				ageRating: "R",
				anime: {
					genres: ["Action"],
					tags: [
						{
							name: "Gore",
							rank: 80,
							spoiler: false,
						},
						{
							name: "Nudity",
							rank: 20,
							spoiler: false,
						},
						{
							name: "Suicide",
							rank: 90,
							spoiler: true,
						},
					],
				},
				certification: "TV-14",
			}).content_rating,
		).toEqual({
			age: "17+",
			descriptors: ["Gore", "Profanity", "Violence"],
		});
	});

	test("falls back to TMDB's certification, and to nothing", () => {
		expect(about({ certification: "TV-MA" }).content_rating).toEqual({
			age: "17+",
			descriptors: [],
		});
		expect(about({ certification: "NR" }).content_rating).toBeNull();
	});

	test("warns of what TMDB's keywords and ratings' descriptors say it shows", () => {
		expect(
			about({
				anime: {
					genres: ["Adventure", "Horror"],
				},
				certification: "TV-14",
				descriptors: ["Violence / Horror", "Negative examples"],
				keywords: ["Combat", "magic", "smoking", "political intrigue\u00A0"],
			}).content_rating,
		).toEqual({
			age: "14+",
			descriptors: ["Fear", "Smoking", "Violence"],
		});
	});

	test("words the copyright as author, publisher, and production committee", () => {
		const yona = {
			producers: ["TOKYO MX", "Hakusensha", "VAP"],
			staff: [
				{
					name: "Mizuho Kusanagi",
					role: "Original Creator",
				},
				{
					name: "Kazuhiro Yoneda",
					role: "Director",
				},
			],
			studios: ["Studio Pierrot"],
			title: {
				display: "Yona of the Dawn",
				english: "Yona of the Dawn",
				native: null,
				romaji: null,
			},
		};

		expect(about({ anime: yona }).credit).toBe(
			"© Mizuho Kusanagi, Hakusensha/“Yona of the Dawn” Production Committee",
		);
		expect(
			about({
				anime: {
					...yona,
					producers: [],
					staff: [],
				},
			}).credit,
		).toBe("© Studio Pierrot/“Yona of the Dawn” Production Committee");
		expect(
			about({
				anime: {
					...yona,
					countryOfOrigin: "CN",
					producers: [],
				},
			}).credit,
		).toBe("© Mizuho Kusanagi/Studio Pierrot");
	});

	test("keeps the most notable awards: renowned ones, wins, then those given to more titles", () => {
		expect(
			about({
				awardReach: new Map([
					["Anime Trending Awards", 810],
					["Chicago Film Critics Association Awards", 6],
					["Phoenix Film Critics Society Awards", 3],
				]),
				awards: [
					award("Chicago Film Critics Association Awards", 2003, true),
					award("Academy Awards", 2003, true),
					award("Phoenix Film Critics Society Awards", 2003, true),
					award("Anime Trending Awards", 2002, true),
					award("Mainichi Film Concours", 2002, true),
					award("Awards of the Japanese Academy", 2002, false),
					award("BAFTA Awards", 2004, false),
					award("Annie Awards", 2003, true),
				],
			}).awards,
		).toEqual([
			"2002 Anime Trending Awards Winner",
			"2002 Awards of the Japanese Academy Nominee",
			"2002 Mainichi Film Concours Winner",
			"2003 Academy Awards Winner",
			"2003 Annie Awards Winner",
			"2004 BAFTA Awards Nominee",
		]);
	});

	test("picks this year's most notable award, a win over a nomination", () => {
		const year = new Date().getUTCFullYear();
		expect(
			about({
				awardReach: new Map([["Anime Trending Awards", 810]]),
				awards: [
					award("Anime Trending Awards", year, true),
					award("Crunchyroll Anime Awards", year, false),
					award("Crunchyroll Anime Awards", year, true),
					award("Tokyo Anime Award", year - 1, true),
				],
			}).current_award,
		).toBe(`${year} Crunchyroll Anime Awards Winner`);
		expect(about().current_award).toBeNull();
	});

	test("shows AniList's whole synopsis, else the stored one", () => {
		const whole =
			"Koyuki keeps a wall between herself and others.\n\nThis is the story of four young people.";
		expect(
			about({
				anime: {
					story: whole,
				},
				overview: "Koyuki keeps everyone at arm's length.",
			}).synopsis,
		).toBe(whole);
		expect(
			about({
				overview: "Koyuki keeps everyone at arm's length.",
			}).synopsis,
		).toBe("Koyuki keeps everyone at arm's length.");
	});
});
