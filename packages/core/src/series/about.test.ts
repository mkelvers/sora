import { describe, expect, test } from "bun:test";

import type { Anime } from "../catalog/models/anime";
import { anime } from "../catalog/models/anime.fixture";
import { About } from "./about";
import type { AboutSources } from "./about";

/** What an about section is made from: Attack on Titan's, with `fields` changed. */
class Sources {
	readonly #fields: Partial<Omit<AboutSources, "anime">> & { anime?: Partial<Anime> };

	constructor(fields: Partial<Omit<AboutSources, "anime">> & { anime?: Partial<Anime> } = {}) {
		this.#fields = fields;
	}

	get about() {
		return new About({
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
			...this.#fields,
			anime: {
				...anime(16_498),
				...this.#fields.anime,
			},
		}).section;
	}
}

describe("About", () => {
	test("names the original language for a sub and English for a dub", () => {
		expect(new Sources({ audio: ["dub", "sub"] }).about.audio_languages).toEqual([
			"Japanese",
			"English",
		]);
		expect(
			new Sources({
				anime: {
					countryOfOrigin: "CN",
				},
				audio: ["sub"],
			}).about.audio_languages,
		).toEqual(["Chinese"]);
		expect(new Sources({ audio: ["dub"] }).about.audio_languages).toEqual(["English"]);
	});

	test("lists subtitles English first, then by name, once each", () => {
		expect(
			new Sources({
				subtitles: ["es-419", "pt-BR", "en", "ar", "es", "xx-unknown-tag-1"],
			}).about.subtitle_languages,
		).toEqual(["English", "Arabic", "Brazilian Portuguese", "Latin American Spanish", "Spanish"]);
	});

	test("words the awards a season was given oldest first, a year's nominations before its wins", () => {
		const awards = [
			{
				name: "Tokyo Anime Award",
				won: true,
				year: 2014,
			},
			{
				name: "Crunchyroll Anime Awards",
				won: true,
				year: 2017,
			},
			{
				name: "Japan Expo Awards",
				won: false,
				year: null,
			},
			{
				name: "Tokyo Anime Award",
				won: false,
				year: 2014,
			},
			{
				name: "Crunchyroll Anime Awards",
				won: true,
				year: 2018,
			},
			{
				name: "Anime Trending Awards",
				won: true,
				year: 2013,
			},
		];

		const season = (startDate: string, seasonStarts: number[]) =>
			new Sources({
				anime: {
					startDate,
				},
				awards,
				seasonStarts,
			}).about.awards;

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
			new Sources({
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
			}).about.content_rating,
		).toEqual({
			age: "17+",
			descriptors: ["Gore", "Profanity", "Violence"],
		});
	});

	test("falls back to TMDB's certification, and to nothing", () => {
		expect(new Sources({ certification: "TV-MA" }).about.content_rating).toEqual({
			age: "17+",
			descriptors: [],
		});
		expect(new Sources({ certification: "NR" }).about.content_rating).toBeNull();
	});

	test("warns of what TMDB's keywords and ratings' descriptors say it shows", () => {
		expect(
			new Sources({
				anime: {
					genres: ["Adventure", "Horror"],
				},
				certification: "TV-14",
				descriptors: ["Violence / Horror", "Negative examples"],
				keywords: ["Combat", "magic", "smoking", "political intrigue\u00A0"],
			}).about.content_rating,
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

		expect(new Sources({ anime: yona }).about.credit).toBe(
			"© Mizuho Kusanagi, Hakusensha/“Yona of the Dawn” Production Committee",
		);
		expect(
			new Sources({
				anime: {
					...yona,
					producers: [],
					staff: [],
				},
			}).about.credit,
		).toBe("© Studio Pierrot/“Yona of the Dawn” Production Committee");
		expect(
			new Sources({
				anime: {
					...yona,
					countryOfOrigin: "CN",
					producers: [],
				},
			}).about.credit,
		).toBe("© Mizuho Kusanagi/Studio Pierrot");
	});

	test("keeps the most notable awards: renowned ones, wins, then those given to more titles", () => {
		expect(
			new Sources({
				awardReach: new Map([
					["Anime Trending Awards", 810],
					["Chicago Film Critics Association Awards", 6],
					["Phoenix Film Critics Society Awards", 3],
				]),
				awards: [
					{
						name: "Chicago Film Critics Association Awards",
						won: true,
						year: 2003,
					},
					{
						name: "Academy Awards",
						won: true,
						year: 2003,
					},
					{
						name: "Phoenix Film Critics Society Awards",
						won: true,
						year: 2003,
					},
					{
						name: "Anime Trending Awards",
						won: true,
						year: 2002,
					},
					{
						name: "Mainichi Film Concours",
						won: true,
						year: 2002,
					},
					{
						name: "Awards of the Japanese Academy",
						won: false,
						year: 2002,
					},
					{
						name: "BAFTA Awards",
						won: false,
						year: 2004,
					},
					{
						name: "Annie Awards",
						won: true,
						year: 2003,
					},
				],
			}).about.awards,
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
			new Sources({
				awardReach: new Map([["Anime Trending Awards", 810]]),
				awards: [
					{
						name: "Anime Trending Awards",
						won: true,
						year,
					},
					{
						name: "Crunchyroll Anime Awards",
						won: false,
						year,
					},
					{
						name: "Crunchyroll Anime Awards",
						won: true,
						year,
					},
					{
						name: "Tokyo Anime Award",
						won: true,
						year: year - 1,
					},
				],
			}).about.current_award,
		).toBe(`${year} Crunchyroll Anime Awards Winner`);
		expect(new Sources().about.current_award).toBeNull();
	});

	test("shows the synopsis that says more: AniList's about-length one, else the stored one", () => {
		const blurb =
			"Socially inept, Koyuki keeps a wall between herself and other people. Then she meets Minato, a boy who keeps closing the distance.";

		expect(
			new Sources({
				anime: {
					blurb,
				},
				overview: "Koyuki keeps everyone at arm's length.",
			}).about.synopsis,
		).toBe(blurb);
		expect(
			new Sources({
				overview: "Koyuki keeps everyone at arm's length.",
			}).about.synopsis,
		).toBe("Koyuki keeps everyone at arm's length.");
	});
});
