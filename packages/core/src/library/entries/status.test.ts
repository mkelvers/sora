import { describe, expect, test } from "bun:test";

import { seriesProgress, type EpisodeProgress, type TitleEpisode } from "../progress/resume";
import { statusFor } from "./status";

/** A season of `count` released episodes; `airing` leaves out its finale. */
function season(seasonId: string, count: number, airing = false): TitleEpisode[] {
	return Array.from(
		{
			length: count,
		},
		(_, index) => ({
			seasonId,
			inWatchOrder: true,
			number: index + 1,
			isExtra: false,
			isReleased: true,
			releasedAt: null,
			isFinale: !airing && index === count - 1,
		}),
	);
}

/** Episodes `from` to `to` of a season watched, the last one latest. */
function watched(seasonId: string, from: number, to: number): EpisodeProgress[] {
	return Array.from(
		{
			length: to - from + 1,
		},
		(_, index) => ({
			seasonId,
			episode: to - index,
			positionSeconds: 1440,
			durationSeconds: 1440,
			watched: true,
			eventAt: "2026-01-01T00:00:00.000Z",
		}),
	);
}

const progressOf = (episodes: TitleEpisode[], checkpoints: EpisodeProgress[]) =>
	seriesProgress(episodes, checkpoints, new Map());

describe("statusFor", () => {
	test("leaves a title out of the library until it is started", () => {
		expect(statusFor(null, progressOf(season("s1", 12), []), [])).toBeNull();
	});

	test("keeps an added title planned until it is started", () => {
		expect(statusFor("planning", progressOf(season("s1", 12), []), [])).toBe("planning");
	});

	test("starts a planned title once an episode is played", () => {
		expect(statusFor("planning", progressOf(season("s1", 12), watched("s1", 1, 1)), ["s1"])).toBe(
			"watching",
		);
	});

	test("keeps watching a season still airing, even when caught up", () => {
		const airing = season("s1", 23, true);

		expect(statusFor("watching", progressOf(airing, watched("s1", 1, 23)), ["s1"])).toBe(
			"watching",
		);
	});

	test("completes a title once its finished last season is watched", () => {
		expect(statusFor("watching", progressOf(season("s1", 12), watched("s1", 1, 12)), ["s1"])).toBe(
			"completed",
		);
	});

	test("completes a title whose next part is only announced", () => {
		const announced = [
			...season("s1", 12),
			...season("film", 1, true).map((episode) => ({
				...episode,
				isReleased: false,
			})),
		];

		expect(statusFor("watching", progressOf(announced, watched("s1", 1, 12)), ["s1"])).toBe(
			"completed",
		);
	});

	test("keeps a completed title completed when a new part comes out", () => {
		const released = [...season("s1", 12), ...season("film", 1)];

		expect(statusFor("completed", progressOf(released, watched("s1", 1, 12)), [])).toBe(
			"completed",
		);
	});

	test("keeps a completed title completed while what was finished is replayed", () => {
		const released = [...season("s1", 12), ...season("film", 1)];

		expect(statusFor("completed", progressOf(released, watched("s1", 1, 12)), ["s1"])).toBe(
			"completed",
		);
	});

	test("reopens a completed title once its new part is played", () => {
		const released = [...season("s1", 12), ...season("film", 1)];
		const started = [
			{
				...watched("film", 1, 1)[0]!,
				positionSeconds: 300,
				watched: false,
			},
			...watched("s1", 1, 12),
		];

		expect(statusFor("completed", progressOf(released, started), ["film"])).toBe("watching");
	});

	test("plans a title again once all of its progress is cleared", () => {
		expect(statusFor("completed", progressOf(season("s1", 12), []), [])).toBe("planning");
	});
});
