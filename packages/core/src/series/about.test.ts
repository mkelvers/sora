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

	test("credits the original work's creator, then the studios, as a copyright notice does", () => {
		expect(
			about({
				anime: {
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
				},
			}).credit,
		).toBe("© Mizuho Kusanagi/Studio Pierrot");
		expect(about({ anime: { studios: ["Kyoto Animation"] } }).credit).toBe("© Kyoto Animation");
		expect(about().credit).toBeNull();
	});
});
