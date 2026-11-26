import { expect, mock, spyOn, test } from "bun:test";

import { eq } from "drizzle-orm";

import { anime } from "../catalog/models/anime.fixture";
import { catalog } from "../catalog/queries/anime";
import * as schedule from "../catalog/queries/schedule";
import { db } from "../database/client";
import { providerEpisodes } from "../database/schema/playback";
import { episodeStill, series, titleEpisode } from "../database/schema/series";
import { aniKoto } from "../playback/providers/registry";
import * as layout from "./series";
import { store } from "./store";

test("rebuilding preserves details for the same episode and honors remaps and rejected images", async () => {
	const anilistId = -1_984_001;
	const id = "rebuild-episode-details";
	const showId = 1_984_001;
	const key = `tv:${showId}` as const;
	const now = new Date();
	const airDate = "2026-11-22";
	const stillUrl = "https://image.tmdb.org/t/p/original/still.jpg";

	await db.insert(series).values({
		anilistId,
		id,
		key,
		kind: "tv",
		laidOutAt: now,
		title: "Rebuilt title",
	});

	await db.insert(titleEpisode).values(
		[1, 2, 3].map((number) => ({
			airDate,
			number,
			overview: `Description ${number}`,
			runtimeMinutes: 24,
			seriesId: id,
			stillUrl,
			title: `Chapter ${number}`,
			tmdbEpisodeNumber: number,
			tmdbSeasonNumber: 1,
		})),
	);

	await db.insert(episodeStill).values({
		chosenAt: now,
		episodeNumber: 3,
		path: null,
		seasonNumber: 1,
		showId,
	});

	const rebuilt = {
		anilistId,
		backdropUrl: null,
		episodes: [
			{
				match: 1,
				number: 1,
			},
			{
				match: 4,
				number: 2,
			},
			{
				match: 3,
				number: 3,
			},
		].map(({ number, match }) => ({
			airDate: null,
			number,
			overview: null,
			runtimeMinutes: null,
			stillUrl: null,
			title: `Episode ${number}`,
			tmdb: {
				episodeNumber: match,
				seasonNumber: 1,
			},
		})),
		key,
		kind: "tv",
		logoUrl: null,
		mayGainEpisodes: false,
		nextAiring: null,
		overview: null,
		posterUrl: null,
		related: [],
		startDate: null,
		status: "FINISHED",
		title: "Rebuilt title",
		useAniListAirings: false,
	} satisfies layout.SeriesLayout;

	spyOn(layout, "layOut").mockResolvedValue(rebuilt);
	spyOn(catalog, "anime").mockResolvedValue(anime(anilistId));

	try {
		await store.save(anilistId);
	} finally {
		mock.restore();
	}

	const episodes = await db
		.select()
		.from(titleEpisode)
		.where(eq(titleEpisode.seriesId, id))
		.orderBy(titleEpisode.number);

	expect(episodes).toMatchObject([
		{
			airDate,
			number: 1,
			overview: "Description 1",
			runtimeMinutes: 24,
			stillUrl,
			title: "Chapter 1",
		},
		{
			airDate: null,
			number: 2,
			overview: null,
			stillUrl: null,
			title: "Episode 2",
			tmdbEpisodeNumber: 4,
		},
		{
			airDate,
			number: 3,
			overview: "Description 3",
			stillUrl: null,
			title: "Chapter 3",
		},
	]);
});

test("dates episodes by AniList's current schedule, or by when AniKoto added them up to two weeks before that", async () => {
	const anilistId = -1_984_002;
	const id = "early-episode-release";
	const key = "tv:1984002";
	const secondAired = new Date("2026-11-02T14:00:00.000Z");
	const thirdAired = new Date("2026-11-03T14:00:00.000Z");

	await db.insert(series).values({
		anilistId,
		id,
		key,
		kind: "tv",
		laidOutAt: new Date(),
		title: "Early release",
	});

	// Episode 1's time is from a schedule AniList has since rewritten.
	await db.insert(titleEpisode).values({
		airDate: "2026-10-01",
		airedAt: new Date("2026-12-30T02:00:00.000Z"),
		number: 1,
		seriesId: id,
	});

	await db.insert(providerEpisodes).values({
		anilistId,
		fetchedAt: new Date(),
		provider: aniKoto.id,
		units: [
			{
				// Added after its broadcast, as most episodes are.
				addedAt: "2026-11-02T15:06:00.000Z",
				number: 2,
			},
			{
				// Added the week before its broadcast.
				addedAt: "2026-10-27T21:46:00.000Z",
				number: 3,
			},
			{
				// Added before the air date TMDB gives it, with no AniList time.
				addedAt: "2026-11-01T09:00:00.000Z",
				number: 4,
			},
			{
				// Stamped with the time AniKoto gave the whole list, long before.
				addedAt: "2024-10-18T01:45:06.000Z",
				number: 5,
			},
		].map((unit) => ({
			...unit,
			id: `anikoto:${unit.number}`,
			isFiller: false,
			languages: ["sub"],
			title: `Episode ${unit.number}`,
		})),
	});

	const rebuilt = {
		anilistId,
		backdropUrl: null,
		episodes: ["2026-10-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].map(
			(airDate, index) => ({
				airDate,
				number: index + 1,
				overview: null,
				runtimeMinutes: null,
				stillUrl: null,
				title: null,
				tmdb: null,
			}),
		),
		key,
		kind: "tv",
		logoUrl: null,
		mayGainEpisodes: true,
		nextAiring: null,
		overview: null,
		posterUrl: null,
		related: [],
		startDate: null,
		status: "RELEASING",
		title: "Early release",
		useAniListAirings: true,
	} satisfies layout.SeriesLayout;

	spyOn(layout, "layOut").mockResolvedValue(rebuilt);
	spyOn(catalog, "anime").mockResolvedValue(anime(anilistId));
	spyOn(schedule, "fetchEpisodeAirings").mockResolvedValue(
		new Map([
			[`${anilistId}:2`, secondAired],
			[`${anilistId}:3`, thirdAired],
		]),
	);

	try {
		await store.save(anilistId);
	} finally {
		mock.restore();
	}

	const episodes = await db
		.select({
			airedAt: titleEpisode.airedAt,
			number: titleEpisode.number,
		})
		.from(titleEpisode)
		.where(eq(titleEpisode.seriesId, id))
		.orderBy(titleEpisode.number);

	expect(episodes).toEqual([
		{
			airedAt: null,
			number: 1,
		},
		{
			airedAt: secondAired,
			number: 2,
		},
		{
			airedAt: new Date("2026-10-27T21:46:00.000Z"),
			number: 3,
		},
		{
			airedAt: new Date("2026-11-01T09:00:00.000Z"),
			number: 4,
		},
		{
			airedAt: null,
			number: 5,
		},
	]);
});
