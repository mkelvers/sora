import { beforeEach, describe, expect, test } from "bun:test";

import { HttpClient } from "anime-sdk";

import { config } from "../config";
import { fetchTimetable, isoWeek } from "./timetable";

/** What AnimeSchedule answers every request with. */
let timetable: unknown[] = [];
const asked: {
	url: string;
	headers: RequestInit["headers"];
}[] = [];

const http = new HttpClient({
	transport: {
		fetch: async (url, init) => {
			asked.push({
				headers: init.headers,
				url,
			});
			return Response.json(timetable);
		},
	},
});

beforeEach(() => {
	timetable = [];
	asked.length = 0;
});

/** A timetable entry as AnimeSchedule's API sends it, trimmed to a few of its fields. */
function entry(
	route: string,
	episodeNumber: number,
	episodeDate: string,
	airType = "raw",
	airingStatus = "unaired",
) {
	return {
		airType,
		airingStatus,
		episodeDate,
		episodeNumber,
		episodes: 24,
		route,
		title: route,
	};
}

describe("fetchTimetable", () => {
	test("asks for the week's whole timetable in UTC with the app's token", async () => {
		await fetchTimetable(http, {
			week: 40,
			year: 2026,
		});

		expect(asked).toEqual([
			{
				headers: {
					Authorization: `Bearer ${config.animeScheduleApiKey}`,
				},
				url: "https://animeschedule.net/api/v3/timetables/all?year=2026&week=40&tz=UTC",
			},
		]);
	});

	test("lists each episode's show, how it comes out, episode, and time", async () => {
		timetable = [
			entry("mushoku-tensei-iii-isekai-ittara-honki-dasu", 13, "2026-10-04T15:01:00Z", "dub"),
			entry("yomi-no-tsugai", 24, "2026-10-03T16:00:00Z", "raw"),
			entry("yomi-no-tsugai", 24, "2026-10-03T16:30:00Z", "sub"),
		];

		expect(
			await fetchTimetable(http, {
				week: 40,
				year: 2026,
			}),
		).toEqual([
			{
				airType: "dub",
				airsAt: new Date("2026-10-04T15:01:00Z"),
				donghua: false,
				episode: 13,
				lengthMinutes: null,
				route: "mushoku-tensei-iii-isekai-ittara-honki-dasu",
			},
			{
				airType: "raw",
				airsAt: new Date("2026-10-03T16:00:00Z"),
				donghua: false,
				episode: 24,
				lengthMinutes: null,
				route: "yomi-no-tsugai",
			},
			{
				airType: "sub",
				airsAt: new Date("2026-10-03T16:30:00Z"),
				donghua: false,
				episode: 24,
				lengthMinutes: null,
				route: "yomi-no-tsugai",
			},
		]);
	});

	test("lists whether the show is a donghua and how long its episodes run", async () => {
		timetable = [
			{
				...entry("ni-tian-zhizun", 558, "2026-10-16T02:00:00Z"),
				donghua: true,
				lengthMin: 10,
			},
			{
				...entry("sore-ike-anpanman", 1749, "2026-10-16T01:55:00Z"),
				donghua: false,
				lengthMin: 0,
			},
		];

		expect(
			(
				await fetchTimetable(http, {
					week: 42,
					year: 2026,
				})
			).map(({ route, donghua, lengthMinutes }) => ({ donghua, lengthMinutes, route })),
		).toEqual([
			{
				donghua: true,
				lengthMinutes: 10,
				route: "ni-tian-zhizun",
			},
			{
				donghua: false,
				lengthMinutes: null,
				route: "sore-ike-anpanman",
			},
		]);
	});

	test("lists each episode of an entry for several at once, as a double-episode premiere", async () => {
		timetable = [
			{
				...entry(
					"tensei-shita-daiseijo-wa-seijo-de-aru-koto-wo-hitakakusu",
					2,
					"2026-10-03T13:00:00Z",
				),
				subtractedEpisodeNumber: 1,
			},
		];

		expect(
			(
				await fetchTimetable(http, {
					week: 40,
					year: 2026,
				})
			).map((release) => release.episode),
		).toEqual([1, 2]);
	});

	test("leaves out a delayed episode, which is listed again in the week it airs", async () => {
		timetable = [
			entry("bleach-sennen-kessen-hen-kashin-tan", 9, "2026-09-28T15:00:00Z", "raw", "delayed-air"),
			entry("chiikawa", 382, "2026-10-02T23:55:00Z", "raw", "aired"),
		];

		expect(
			(
				await fetchTimetable(http, {
					week: 40,
					year: 2026,
				})
			).map((release) => release.route),
		).toEqual(["chiikawa"]);
	});

	test("leaves out a delayed episode in the weeks before it airs, where it is not marked delayed-air", async () => {
		const held = {
			delayedFrom: "2026-09-14T00:00:00Z",
			delayedText: "Delayed",
			delayedUntil: "2026-10-19T00:00:00Z",
		};
		timetable = [
			{
				...entry("bleach-sennen-kessen-hen-kashin-tan", 9, "2026-10-05T15:00:00Z"),
				...held,
			},
			{
				...entry("bleach-sennen-kessen-hen-kashin-tan", 9, "2026-10-19T15:00:00Z"),
				...held,
				delayedText: undefined,
			},
			{
				...entry("chiikawa", 382, "2026-10-02T23:55:00Z", "raw", "aired"),
				delayedFrom: "2026-10-05T00:00:00Z",
				delayedText: "Delayed",
				delayedUntil: "0001-01-01T00:00:00Z",
			},
			{
				...entry("yani-neko", 11, "2026-10-01T15:00:00Z", "dub"),
				delayedFrom: "0001-01-01T00:00:00Z",
				delayedText: "Delayed",
				delayedUntil: "0001-01-01T00:00:00Z",
			},
		];

		expect(
			(
				await fetchTimetable(http, {
					week: 41,
					year: 2026,
				})
			).map((release) => `${release.route} ${release.airsAt.toISOString()}`),
		).toEqual([
			"bleach-sennen-kessen-hen-kashin-tan 2026-10-19T15:00:00.000Z",
			"chiikawa 2026-10-02T23:55:00.000Z",
		]);
	});

	test("leaves out an entry it cannot read, keeping the rest", async () => {
		timetable = [
			{
				airType: "raw",
				airingStatus: "unaired",
				episodeDate: "2026-10-03T16:00:00Z",
				route: "no-episode",
			},
			entry("half-episode", 12.5, "2026-10-03T16:00:00Z"),
			entry("yomi-no-tsugai", 24, "2026-10-03T16:00:00Z"),
		];

		expect(
			(
				await fetchTimetable(http, {
					week: 40,
					year: 2026,
				})
			).map((release) => release.route),
		).toEqual(["yomi-no-tsugai"]);
	});
});

describe("isoWeek", () => {
	test("numbers weeks from Monday, as AnimeSchedule's timetable does", () => {
		expect(isoWeek(new Date("2026-09-21T00:00:00Z"))).toEqual({
			week: 39,
			year: 2026,
		});
		expect(isoWeek(new Date("2026-09-27T23:59:00Z"))).toEqual({
			week: 39,
			year: 2026,
		});
		expect(isoWeek(new Date("2026-09-28T00:00:00Z"))).toEqual({
			week: 40,
			year: 2026,
		});
	});

	test("puts days around New Year in the week that holds their Thursday", () => {
		expect(isoWeek(new Date("2027-01-01T12:00:00Z"))).toEqual({
			week: 53,
			year: 2026,
		});
		expect(isoWeek(new Date("2025-12-29T12:00:00Z"))).toEqual({
			week: 1,
			year: 2026,
		});
	});
});
