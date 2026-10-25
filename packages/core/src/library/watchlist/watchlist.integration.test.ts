import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { eq, sql } from "drizzle-orm";

import { closeDatabase, db } from "../../database/client";
import { anime } from "../../database/schema/catalog";
import { seriesState } from "../../database/schema/library";
import { series, seriesEpisode } from "../../database/schema/series";
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
			media: {
				averageScore: null,
				bannerImage: null,
				countryOfOrigin: null,
				coverImage: null,
				description: null,
				duration: null,
				endDate: null,
				episodes: 120,
				format: "TV_SHORT",
				genres: [],
				id: anilistId,
				idMal: null,
				isAdult: false,
				nextAiringEpisode: null,
				popularity: null,
				recommendations: null,
				relations: null,
				season: null,
				seasonYear: null,
				source: null,
				startDate: null,
				status: "FINISHED",
				studios: null,
				synonyms: [],
				tags: [],
				title: {
					english: "Saved short title",
					native: null,
					romaji: null,
				},
			},
			refreshedAt: updatedAt,
		});
		await db.insert(series).values({
			anilistId,
			id,
			key: `anilist:${anilistId}`,
			kind: "standalone",
			laidOutAt: updatedAt,
			status: "FINISHED",
			title: "Saved short title",
		});
		await db.insert(seriesState).values({
			addedAt,
			seriesId: id,
			status: "completed",
			statusChangedAt: updatedAt,
			userId: profile,
		});
	});

	afterAll(async () => {
		try {
			await db.delete(series).where(eq(series.id, id));
			await db.delete(anime).where(eq(anime.anilistId, anilistId));
			await db.execute(sql`select graphile_worker.remove_job(${`episodes:${anilistId}`})`);
		} finally {
			await closeDatabase();
		}
	});

	test("keeps saved dates and a usable detail page while discovery excludes the title", async () => {
		const [row] = await db.select().from(series).where(eq(series.id, id));
		if (!row) {
			throw new Error("Missing watchlist test fixture");
		}
		const cards = await toSeriesCards([row]);
		const cardsOfAnotherTitle = await toSeriesCards([row], ["another-title"]);
		expect(cards.size).toBe(0);
		expect(cardsOfAnotherTitle.size).toBe(0);

		const [entry] = await getWatchlist(profile);
		if (!entry) {
			throw new Error("Saved short title missing from watchlist");
		}
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
		await db.insert(seriesEpisode).values({ number: 24, seriesId: id });
		await setWatchlistStatus(profile, id, "watching");
		await updateWatchlistAfterPlayback(profile, id, { episode: 24, finished: true });
		const [completed] = await getWatchlist(profile);
		expect(completed?.status).toBe("completed");
	});
});
