import { describe, expect, mock, test } from "bun:test";

import type { HttpClient } from "anime-sdk";

mock.module("../config", () => ({
	config: {
		animeScheduleApiKey: "token",
	},
}));
mock.module("../database/client", () => ({
	db: {},
}));

const { fetchTimetable, isoWeek } = await import("./timetable");

let asked: {
	url: string;
	headers: Record<string, string>;
}[] = [];

/** An HTTP client that answers every request with `body`, recording what it was asked. */
function serving(body: unknown) {
	asked = [];
	return {
		get: async (
			url: string,
			options: {
				headers: Record<string, string>;
			},
		) => {
			asked.push({
				url,
				headers: options.headers,
			});
			return {
				json: async () => body,
			};
		},
	} as unknown as HttpClient;
}

/** A timetable entry as AnimeSchedule's API sends it, trimmed to a few of its fields. */
function entry(
	route: string,
	episodeNumber: number,
	episodeDate: string,
	airType = "raw",
	airingStatus = "unaired",
) {
	return {
		title: route,
		route,
		episodeDate,
		episodeNumber,
		episodes: 24,
		airType,
		airingStatus,
	};
}

describe("fetchTimetable", () => {
	test("asks for the week's whole timetable in UTC with the app's token", async () => {
		await fetchTimetable(serving([]), {
			year: 2026,
			week: 40,
		});

		expect(asked).toEqual([
			{
				url: "https://animeschedule.net/api/v3/timetables/all?year=2026&week=40&tz=UTC",
				headers: {
					Authorization: "Bearer token",
				},
			},
		]);
	});

	test("lists each episode's show, how it comes out, episode, and time", async () => {
		const timetable = [
			entry("mushoku-tensei-iii-isekai-ittara-honki-dasu", 13, "2026-10-04T15:01:00Z", "dub"),
			entry("yomi-no-tsugai", 24, "2026-10-03T16:00:00Z", "raw"),
			entry("yomi-no-tsugai", 24, "2026-10-03T16:30:00Z", "sub"),
		];

		expect(
			await fetchTimetable(serving(timetable), {
				year: 2026,
				week: 40,
			}),
		).toEqual([
			{
				route: "mushoku-tensei-iii-isekai-ittara-honki-dasu",
				airType: "dub",
				episode: 13,
				airsAt: new Date("2026-10-04T15:01:00Z"),
			},
			{
				route: "yomi-no-tsugai",
				airType: "raw",
				episode: 24,
				airsAt: new Date("2026-10-03T16:00:00Z"),
			},
			{
				route: "yomi-no-tsugai",
				airType: "sub",
				episode: 24,
				airsAt: new Date("2026-10-03T16:30:00Z"),
			},
		]);
	});

	test("lists each episode of an entry for several at once, as a double-episode premiere", async () => {
		const timetable = [
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
				await fetchTimetable(serving(timetable), {
					year: 2026,
					week: 40,
				})
			).map((release) => release.episode),
		).toEqual([1, 2]);
	});

	test("leaves out a delayed episode, which is listed again in the week it airs", async () => {
		const timetable = [
			entry("bleach-sennen-kessen-hen-kashin-tan", 9, "2026-09-28T15:00:00Z", "raw", "delayed-air"),
			entry("chiikawa", 382, "2026-10-02T23:55:00Z", "raw", "aired"),
		];

		expect(
			(
				await fetchTimetable(serving(timetable), {
					year: 2026,
					week: 40,
				})
			).map((release) => release.route),
		).toEqual(["chiikawa"]);
	});

	test("leaves out a delayed episode in the weeks before it airs, where it is not marked delayed-air", async () => {
		const held = {
			delayedText: "Delayed",
			delayedFrom: "2026-09-14T00:00:00Z",
			delayedUntil: "2026-10-19T00:00:00Z",
		};
		const timetable = [
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
				delayedText: "Delayed",
				delayedFrom: "2026-10-05T00:00:00Z",
				delayedUntil: "0001-01-01T00:00:00Z",
			},
			{
				...entry("yani-neko", 11, "2026-10-01T15:00:00Z", "dub"),
				delayedText: "Delayed",
				delayedFrom: "0001-01-01T00:00:00Z",
				delayedUntil: "0001-01-01T00:00:00Z",
			},
		];

		expect(
			(
				await fetchTimetable(serving(timetable), {
					year: 2026,
					week: 41,
				})
			).map((release) => `${release.route} ${release.airsAt.toISOString()}`),
		).toEqual([
			"bleach-sennen-kessen-hen-kashin-tan 2026-10-19T15:00:00.000Z",
			"chiikawa 2026-10-02T23:55:00.000Z",
		]);
	});

	test("leaves out an entry it cannot read, keeping the rest", async () => {
		const timetable = [
			{
				route: "no-episode",
				airType: "raw",
				episodeDate: "2026-10-03T16:00:00Z",
				airingStatus: "unaired",
			},
			entry("half-episode", 12.5, "2026-10-03T16:00:00Z"),
			entry("yomi-no-tsugai", 24, "2026-10-03T16:00:00Z"),
		];

		expect(
			(
				await fetchTimetable(serving(timetable), {
					year: 2026,
					week: 40,
				})
			).map((release) => release.route),
		).toEqual(["yomi-no-tsugai"]);
	});
});

describe("isoWeek", () => {
	test("numbers weeks from Monday, as AnimeSchedule's timetable does", () => {
		expect(isoWeek(new Date("2026-09-21T00:00:00Z"))).toEqual({
			year: 2026,
			week: 39,
		});
		expect(isoWeek(new Date("2026-09-27T23:59:00Z"))).toEqual({
			year: 2026,
			week: 39,
		});
		expect(isoWeek(new Date("2026-09-28T00:00:00Z"))).toEqual({
			year: 2026,
			week: 40,
		});
	});

	test("puts days around New Year in the week that holds their Thursday", () => {
		expect(isoWeek(new Date("2027-01-01T12:00:00Z"))).toEqual({
			year: 2026,
			week: 53,
		});
		expect(isoWeek(new Date("2025-12-29T12:00:00Z"))).toEqual({
			year: 2026,
			week: 1,
		});
	});
});
