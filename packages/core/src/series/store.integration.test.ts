import { expect, mock, spyOn, test } from "bun:test";

import { eq } from "drizzle-orm";

import { anime } from "../catalog/models/anime.fixture";
import { catalog } from "../catalog/queries/anime";
import { db } from "../database/client";
import { episodeStill, series, titleEpisode } from "../database/schema/series";
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
