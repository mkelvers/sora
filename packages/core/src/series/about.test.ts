import { describe, expect, test } from "bun:test";

import type { Anime } from "../catalog/models/anime";
import { anime } from "../catalog/models/anime.fixture";
import { aboutSeries } from "./about";
import type { AboutSources } from "./about";

const about = (fields: Partial<Omit<AboutSources, "anime">> & { anime?: Partial<Anime> } = {}) =>
	aboutSeries({
		ageRating: null,
		audio: [],
		awards: [],
		certification: null,
		descriptors: [],
		keywords: [],
		subtitles: [],
		...fields,
		anime: {
			...anime(16_498),
			...fields.anime,
		},
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

	test("words the awards given for this title, the latest first, a win over its nomination", () => {
		expect(
			about({
				anime: {
					endDate: "2013-09-28",
					startDate: "2013-04-07",
					status: "FINISHED",
				},
				awards: [
					{
						name: "Seiyu Awards",
						won: true,
						year: 2014,
					},
					{
						name: "3rd Crunchyroll Anime Awards",
						won: true,
						year: 2015,
					},
					{
						name: "Seiyu Awards",
						won: false,
						year: 2014,
					},
					{
						name: "7th Crunchyroll Anime Awards",
						won: true,
						year: 2023,
					},
					{
						name: "Japan Expo Awards",
						won: false,
						year: null,
					},
				],
			}).awards,
		).toEqual([
			"2015 Crunchyroll Anime Awards Winner",
			"2014 Seiyu Awards Winner",
			"Japan Expo Awards Nominee",
		]);
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

	test("picks this year's award, a win over a nomination", () => {
		const year = new Date().getUTCFullYear();
		expect(
			about({
				awards: [
					{
						name: "Seiyu Awards",
						won: false,
						year,
					},
					{
						name: "10th Crunchyroll Anime Awards",
						won: true,
						year,
					},
					{
						name: "Tokyo Anime Award",
						won: true,
						year: year - 1,
					},
				],
			}).current_award,
		).toBe(`${year} Crunchyroll Anime Awards Winner`);
		expect(about().current_award).toBeNull();
	});
});
