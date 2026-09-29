import { describe, expect, test } from "bun:test";

import {
	continuePoint,
	seriesProgress,
	unstartedSeason,
	type EpisodeProgress,
	type TitleEpisode,
} from "./resume";

/** A finished season of `count` released episodes, released at `releasedAt` when given. */
function season(
	seasonId: string,
	count: number,
	inWatchOrder = true,
	releasedAt: string | null = null,
): TitleEpisode[] {
	return Array.from(
		{
			length: count,
		},
		(_, index) => ({
			seasonId,
			inWatchOrder,
			number: index + 1,
			isExtra: false,
			isReleased: true,
			releasedAt,
			isFinale: index === count - 1,
		}),
	);
}

const checkpoint = (
	seasonId: string,
	episode: number,
	positionSeconds: number,
	watched: boolean,
	eventAt = "2026-01-01T00:00:00.000Z",
): EpisodeProgress => ({
	seasonId,
	episode,
	positionSeconds,
	durationSeconds: 1440,
	watched,
	eventAt,
});

/** Every episode of a season watched, the last one latest, all at `eventAt`. */
const watchedSeason = (seasonId: string, count: number, eventAt = "2026-01-01T00:00:00.000Z") =>
	Array.from(
		{
			length: count,
		},
		(_, index) => checkpoint(seasonId, count - index, 1440, true, eventAt),
	);

// Frieren, reduced: two seasons of three episodes and a one-episode OVA.
const frieren = [...season("s1", 3), ...season("s2", 3), ...season("ova1", 1, false)];

describe("continuePoint", () => {
	test("resumes an unfinished episode where it stopped", () => {
		expect(continuePoint(frieren, [checkpoint("s1", 2, 600, false)])).toEqual({
			seasonId: "s1",
			episode: 2,
			positionSeconds: 600,
			durationSeconds: 1440,
		});
	});

	test("resumes a watched episode played again where it stopped", () => {
		expect(continuePoint(frieren, [checkpoint("s1", 2, 600, true)])).toMatchObject({
			seasonId: "s1",
			episode: 2,
			positionSeconds: 600,
		});
	});

	test("starts the next episode after a completed one", () => {
		expect(continuePoint(frieren, [checkpoint("s1", 2, 1400, true)])).toEqual({
			seasonId: "s1",
			episode: 3,
			positionSeconds: 0,
			durationSeconds: null,
		});
	});

	test("continues from the last episode of a season into the next season", () => {
		expect(continuePoint(frieren, [checkpoint("s1", 3, 1400, true)])).toMatchObject({
			seasonId: "s2",
			episode: 1,
		});
	});

	test("does not continue from the last regular season into the OVAs", () => {
		expect(continuePoint(frieren, [checkpoint("s2", 3, 1400, true)])).toBeNull();
	});

	test("resumes the next episode from its own checkpoint", () => {
		expect(
			continuePoint(frieren, [checkpoint("s1", 3, 1400, true), checkpoint("s2", 1, 300, false)]),
		).toEqual({
			seasonId: "s2",
			episode: 1,
			positionSeconds: 300,
			durationSeconds: 1440,
		});
	});

	test("skips extras that cannot be played", () => {
		const withRecap = [
			...season("s1", 2),
			{
				seasonId: "s1",
				inWatchOrder: true,
				number: 3,
				isExtra: true,
				isReleased: true,
				releasedAt: null,
				isFinale: false,
			},
			...season("s2", 1),
		];

		expect(continuePoint(withRecap, [checkpoint("s1", 2, 1400, true)])).toMatchObject({
			seasonId: "s2",
			episode: 1,
		});
	});

	test("waits while the next episode has not aired", () => {
		const airing = [
			...season("s1", 2),
			{
				...season("s1", 3)[2]!,
				isReleased: false,
			},
		];

		expect(continuePoint(airing, [checkpoint("s1", 1, 1400, true)])?.episode).toBe(2);
		expect(continuePoint(airing, [checkpoint("s1", 2, 1400, true)])).toBeNull();
	});

	test("gives up on an episode the title no longer lists", () => {
		expect(continuePoint(frieren, [checkpoint("gone", 1, 1400, true)])).toBeNull();
	});

	test("does not push a season released after the last one was finished", () => {
		const later = [...season("s1", 2), ...season("s2", 2, true, "2026-06-01T00:00:00.000Z")];

		expect(
			continuePoint(later, [checkpoint("s1", 2, 1400, true, "2026-01-01T00:00:00.000Z")]),
		).toBeNull();
		expect(
			continuePoint(later, [checkpoint("s1", 2, 1400, true, "2026-07-01T00:00:00.000Z")]),
		).toMatchObject({
			seasonId: "s2",
			episode: 1,
		});
	});

	test("follows a new episode of the season being watched whenever it airs", () => {
		const weekly = [
			...season("s1", 1),
			...season("s1", 2, true, "2026-06-01T00:00:00.000Z").slice(1),
		];

		expect(
			continuePoint(weekly, [checkpoint("s1", 1, 1400, true, "2026-01-01T00:00:00.000Z")]),
		).toMatchObject({
			seasonId: "s1",
			episode: 2,
		});
	});
});

const titles = new Map([
	["s1", "Season 1"],
	["s2", "Season 2"],
	["ova1", "OVA"],
]);

describe("seriesProgress", () => {
	test("counts nothing before anything is played", () => {
		expect(seriesProgress(frieren, [], titles)).toMatchObject({
			watchedEpisodes: 0,
			releasedEpisodes: 6,
			caughtUp: false,
			next: null,
			newSeason: null,
			lastWatchedAt: null,
		});
	});

	test("counts each season's watched episodes", () => {
		const progress = [checkpoint("s1", 2, 1400, true), checkpoint("s1", 1, 1400, true)];

		expect(seriesProgress(frieren, progress, titles).seasons).toEqual([
			{
				seasonId: "s1",
				title: "Season 1",
				watchedEpisodes: 2,
				releasedEpisodes: 3,
				completed: false,
			},
			{
				seasonId: "s2",
				title: "Season 2",
				watchedEpisodes: 0,
				releasedEpisodes: 3,
				completed: false,
			},
			{
				seasonId: "ova1",
				title: "OVA",
				watchedEpisodes: 0,
				releasedEpisodes: 1,
				completed: false,
			},
		]);
		expect(seriesProgress(frieren, progress, titles).next).toMatchObject({
			seasonId: "s1",
			episode: 3,
		});
	});

	test("completes a season once every episode is watched, without catching up", () => {
		const progress = seriesProgress(frieren, watchedSeason("s1", 3), titles);

		expect(progress.seasons[0]?.completed).toBe(true);
		expect(progress.caughtUp).toBe(false);
		expect(progress.next).toMatchObject({
			seasonId: "s2",
			episode: 1,
		});
	});

	test("does not complete a season whose finale alone is watched", () => {
		const progress = seriesProgress(frieren, [checkpoint("s1", 3, 1400, true)], titles);

		expect(progress.seasons[0]?.completed).toBe(false);
	});

	test("does not complete a season still airing", () => {
		const airing = season("s1", 3).map((episode) => ({
			...episode,
			isFinale: false,
		}));

		expect(seriesProgress(airing, watchedSeason("s1", 3), titles).seasons[0]?.completed).toBe(
			false,
		);
	});

	test("is caught up once every released episode in watch order is watched", () => {
		const progress = seriesProgress(
			frieren,
			[...watchedSeason("s2", 3), ...watchedSeason("s1", 3)],
			titles,
		);

		expect(progress).toMatchObject({
			watchedEpisodes: 6,
			releasedEpisodes: 6,
			caughtUp: true,
			next: null,
		});
	});

	test("is no longer caught up once a new episode airs", () => {
		const weekly = [...season("s1", 2)].map((episode) => ({
			...episode,
			isFinale: false,
		}));
		const aired = [
			...weekly,
			{
				...weekly[1]!,
				number: 3,
			},
		];

		expect(seriesProgress(weekly, watchedSeason("s1", 2), titles).caughtUp).toBe(true);
		expect(seriesProgress(aired, watchedSeason("s1", 2), titles)).toMatchObject({
			caughtUp: false,
			next: {
				seasonId: "s1",
				episode: 3,
			},
		});
	});

	test("offers a season released after the last one was finished", () => {
		const later = [...season("s1", 2), ...season("s2", 2, true, "2026-06-01T00:00:00.000Z")];
		const progress = seriesProgress(later, watchedSeason("s1", 2), titles);

		expect(progress).toMatchObject({
			caughtUp: false,
			next: null,
			newSeason: {
				seasonId: "s2",
				title: "Season 2",
			},
		});
		expect(unstartedSeason(later, watchedSeason("s1", 2))).toBe("s2");
	});

	test("is finished once caught up and no season in watch order is airing", () => {
		expect(
			seriesProgress(frieren, [...watchedSeason("s2", 3), ...watchedSeason("s1", 3)], titles)
				.finished,
		).toBe(true);
	});

	test("is not finished while caught up on a season still airing", () => {
		const airing = [
			...season("s1", 2),
			...season("s2", 2).map((episode) => ({
				...episode,
				isFinale: false,
			})),
		];

		expect(
			seriesProgress(airing, [...watchedSeason("s2", 2), ...watchedSeason("s1", 2)], titles),
		).toMatchObject({
			caughtUp: true,
			finished: false,
		});
	});

	test("is finished while a season is only announced", () => {
		const announced = [
			...season("s1", 2),
			...season("s2", 2).map((episode) => ({
				...episode,
				isReleased: false,
				isFinale: false,
			})),
		];

		expect(seriesProgress(announced, watchedSeason("s1", 2), titles).finished).toBe(true);
	});
});
