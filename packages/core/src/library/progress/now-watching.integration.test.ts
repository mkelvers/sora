import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { eq, inArray } from "drizzle-orm";

import { closeDatabase, db } from "../../database/client";
import { episodeProgress, seriesState } from "../../database/schema/library";
import { series, seriesEpisode } from "../../database/schema/series";
import { getNowWatching } from "./now-watching";

// Opt in against the migrated local database; fixtures never touch real profiles.
describe.skipIf(process.env.SORA_NOW_WATCHING_INTEGRATION !== "1")("portfolio titles", () => {
	const profile = `portfolio-test-${crypto.randomUUID()}`;
	const names = [
		"Newest",
		"Second",
		"Third",
		"Fourth",
		"Stale",
		"Finished",
		"Completed",
		"Other profile",
		"Rewatch",
	];
	const ids = names.map((_, index) => `${profile}-${index}`);
	const idAt = (index: number) => {
		const id = ids[index];
		if (!id) {
			throw new Error("Missing fixture ID");
		}
		return id;
	};

	beforeAll(async () => {
		await Promise.all(
			names.map(async (title, index) => {
				const id = idAt(index);
				await db.insert(series).values({
					anilistId: -Math.floor(Math.random() * 1_000_000_000) - 1,
					id,
					key: id,
					kind: "standalone",
					laidOutAt: new Date(),
					status: "FINISHED",
					title,
				});
				await db.insert(seriesEpisode).values([
					{ number: 1, seriesId: id },
					{ number: 2, seriesId: id },
				]);
				await db.insert(episodeProgress).values({
					durationSeconds: 1400,
					episode: 1,
					finished: index === 5,
					positionSeconds: 100,
					seriesId: id,
					userId: index === 7 ? `${profile}-other` : profile,
					watchedAt: new Date(Date.now() - (index === 4 ? 31 * 86_400_000 : (index + 1) * 60_000)),
				});
			}),
		);
		await db.insert(episodeProgress).values({
			durationSeconds: 1400,
			episode: 2,
			finished: true,
			positionSeconds: 1400,
			seriesId: idAt(5),
			userId: profile,
		});
		await db.insert(seriesState).values(
			[6, 8].map((index) => ({
				addedAt: new Date(),
				rewatchStartedAt: index === 8 ? new Date() : null,
				seriesId: idAt(index),
				status: "completed" as const,
				statusChangedAt: new Date(),
				userId: profile,
			})),
		);
		await db.insert(episodeProgress).values({
			durationSeconds: 1400,
			episode: 1,
			finished: false,
			positionSeconds: 100,
			rewatch: true,
			seriesId: idAt(8),
			userId: profile,
			watchedAt: new Date(),
		});
	});

	afterAll(async () => {
		try {
			await db.delete(series).where(inArray(series.id, ids));
		} finally {
			await closeDatabase();
		}
	});

	test("returns at most three titles by active viewing recency, including rewatches", async () => {
		expect(await getNowWatching(profile)).toEqual(["Rewatch", "Newest", "Second"]);
	});

	test("excludes finished, stale and other profiles before applying the limit", async () => {
		await db.delete(series).where(inArray(series.id, [idAt(8), idAt(0), idAt(1)]));
		expect(await getNowWatching(profile)).toEqual(["Third", "Fourth"]);
		expect(await getNowWatching(`${profile}-missing`)).toEqual([]);
	});

	test("excludes series with progress that are not on Continue Watching", async () => {
		await db
			.insert(seriesState)
			.values({ dismissedAt: new Date(), seriesId: idAt(2), userId: profile });
		expect(await getNowWatching(profile)).toEqual(["Fourth"]);
		await db.delete(seriesState).where(eq(seriesState.seriesId, idAt(2)));
		await db.delete(episodeProgress).where(eq(episodeProgress.userId, profile));
		expect(await getNowWatching(profile)).toEqual([]);
	});
});
