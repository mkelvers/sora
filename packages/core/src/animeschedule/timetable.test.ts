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

const { fetchDubReleases, isoWeek } = await import("./timetable");

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
function entry(route: string, episodeNumber: number, episodeDate: string) {
	return {
		title: route,
		route,
		episodeDate,
		episodeNumber,
		episodes: 24,
		airType: "dub",
		airingStatus: "unaired",
	};
}

describe("fetchDubReleases", () => {
	test("asks for the week's dubs in UTC with the app's token", async () => {
		await fetchDubReleases(serving([]), {
			year: 2026,
			week: 40,
		});

		expect(asked).toEqual([
			{
				url: "https://animeschedule.net/api/v3/timetables/dub?year=2026&week=40&tz=UTC",
				headers: {
					Authorization: "Bearer token",
				},
			},
		]);
	});

	test("lists each dub's show, episode, and time", async () => {
		const timetable = [
			entry("mushoku-tensei-iii-isekai-ittara-honki-dasu", 13, "2026-10-04T15:01:00Z"),
			entry("yomi-no-tsugai", 24, "2026-10-03T16:00:00Z"),
		];

		expect(
			await fetchDubReleases(serving(timetable), {
				year: 2026,
				week: 40,
			}),
		).toEqual([
			{
				route: "mushoku-tensei-iii-isekai-ittara-honki-dasu",
				episode: 13,
				airsAt: new Date("2026-10-04T15:01:00Z"),
			},
			{
				route: "yomi-no-tsugai",
				episode: 24,
				airsAt: new Date("2026-10-03T16:00:00Z"),
			},
		]);
	});

	test("leaves out an entry it cannot read, keeping the rest", async () => {
		const timetable = [
			{
				route: "no-episode",
				episodeDate: "2026-10-03T16:00:00Z",
			},
			entry("yomi-no-tsugai", 24, "2026-10-03T16:00:00Z"),
		];

		expect(
			(
				await fetchDubReleases(serving(timetable), {
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
