import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { closeDatabase, db } from "../../database/client";
import { anime, series, seriesEpisode, seriesState } from "../../database/schema";
import { getSeries, getSeriesEpisodes, toSeriesCards } from "../../series/queries";
import {
	getWatchlist,
	getWatchlistStatuses,
	setWatchlistStatus,
	updateWatchlistAfterPlayback,
} from "./watchlist";

// Opt in against a migrated local database. Synthetic IDs keep the fixture
// separate from real accounts and titles; cleanup runs after failed assertions.
describe.skipIf(process.env.SORA_WATCHLIST_INTEGRATION !== "1")("saved short titles", () => {
	const profile = `watchlist-test-${crypto.randomUUID()}`;
	const id = `${profile}-short`;
	const anilistId = -Math.floor(Math.random() * 100_000_000) - 1;
	const addedAt = new Date("2026-08-20T17:43:26.059Z");
	const updatedAt = new Date("2026-09-15T07:34:26.706Z");

	beforeAll(async () => {
		await db.insert(anime).values({
			anilistId,
			refreshedAt: updatedAt,
			media: {
				id: anilistId,
				idMal: null,
				title: {
					english: "Saved short title",
					romaji: null,
					native: null,
				},
				format: "TV_SHORT",
				status: "FINISHED",
				synonyms: [],
				description: null,
				source: null,
				countryOfOrigin: null,
				bannerImage: null,
				season: null,
				seasonYear: null,
				episodes: 120,
				duration: null,
				averageScore: null,
				popularity: null,
				genres: [],
				isAdult: false,
				startDate: null,
				endDate: null,
				tags: [],
				studios: null,
				relations: null,
				recommendations: null,
				coverImage: null,
				nextAiringEpisode: null,
			},
		});
		await db.insert(series).values({
			id,
			anilistId,
			key: `anilist:${anilistId}`,
			kind: "standalone",
			status: "FINISHED",
			title: "Saved short title",
			laidOutAt: updatedAt,
		});
		await db.insert(seriesState).values({
			userId: profile,
			seriesId: id,
			status: "completed",
			addedAt,
			statusChangedAt: updatedAt,
		});
	});

	afterAll(async () => {
		try {
			await db.delete(series).where(eq(series.id, id));
			await db.delete(anime).where(eq(anime.anilistId, anilistId));
		} finally {
			await closeDatabase();
		}
	});

	test("keeps saved dates and a usable detail page while discovery excludes the title", async () => {
		const [row] = await db.select().from(series).where(eq(series.id, id));
		if (!row) throw new Error("Missing watchlist test fixture");
		expect((await toSeriesCards([row])).size).toBe(0);
		expect((await toSeriesCards([row], ["another-title"])).size).toBe(0);

		const [entry] = await getWatchlist(profile);
		if (!entry) throw new Error("Saved short title missing from watchlist");
		expect(entry.series.id).toBe(id);
		expect(entry.series.format).toBe("TV_SHORT");
		expect(entry.added_at).toBe(addedAt.toISOString());
		expect(entry.updated_at).toBe(updatedAt.toISOString());

		const details = await getSeries(id);
		expect(details.id).toBe(id);
		expect(details.seasons.some((season) => season.series_id === id)).toBe(true);
		expect(await getSeriesEpisodes(id)).toEqual([]);

		await setWatchlistStatus(profile, id, "completed");
		expect(await getWatchlist(profile)).toEqual([entry]);
		expect(await getWatchlistStatuses(profile)).toEqual([
			{
				series_id: id,
				status: "completed",
			},
		]);
	});

	test("completes at the stored playable finale instead of AniList's short count", async () => {
		await db.insert(seriesEpisode).values({ seriesId: id, number: 24 });
		await setWatchlistStatus(profile, id, "watching");
		await updateWatchlistAfterPlayback(profile, id, { episode: 24, finished: true });
		expect((await getWatchlist(profile))[0]?.status).toBe("completed");
	});
});
