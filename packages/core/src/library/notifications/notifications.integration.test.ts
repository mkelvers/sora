import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { eq, inArray } from "drizzle-orm";

import { closeDatabase, db } from "../../database/client";
import {
	episodeDub,
	episodeProgress,
	series,
	seriesEpisode,
	seriesRelated,
	seriesState,
} from "../../database/schema";
import { day } from "../../time";
import { getNotifications } from "./notifications";

// Opt in against a local database with migrations applied. Fixtures use their
// own profile and series IDs, and are removed even when an assertion fails.
describe.skipIf(process.env.SORA_NOTIFICATION_INTEGRATION !== "1")(
	"notifications across seasons",
	() => {
		const profile = `notification-test-${crypto.randomUUID()}`;
		const now = new Date();
		const followedAt = new Date(now.getTime() - 10 * day);
		const releasedAt = new Date(now.getTime() - day);
		const first = `${profile}-1`;
		const second = `${profile}-2`;
		const third = `${profile}-3`;
		const spinOff = `${profile}-spin-off`;
		const ids = [first, second, third, spinOff];
		let anilistIds: number[] = [];

		beforeAll(async () => {
			// Keep synthetic AniList IDs outside the real catalog's positive IDs.
			const base = -Math.floor(Math.random() * 100_000_000) - 1;
			anilistIds = ids.map((_, index) => base - index);
			await db.insert(series).values(
				ids.map((id, index) => ({
					id,
					anilistId: anilistIds[index]!,
					key: `anilist:${anilistIds[index]}`,
					kind: "standalone" as const,
					title: `Notification test ${index}`,
					laidOutAt: now,
				})),
			);
			await db.insert(seriesRelated).values([
				{ seriesId: first, anilistId: anilistIds[1]!, relation: "SEQUEL", position: 0 },
				{ seriesId: third, anilistId: anilistIds[1]!, relation: "PREQUEL", position: 0 },
				{ seriesId: first, anilistId: anilistIds[3]!, relation: "SIDE_STORY", position: 1 },
			]);
			await db.insert(seriesEpisode).values([
				{ seriesId: first, number: 1, airedAt: new Date(now.getTime() - 40 * day) },
				{ seriesId: second, number: 1, airedAt: new Date(now.getTime() - 5 * day) },
				{ seriesId: second, number: 2, airedAt: releasedAt },
				{ seriesId: third, number: 2, airedAt: releasedAt },
				{ seriesId: spinOff, number: 1, airedAt: releasedAt },
			]);
			await db.insert(episodeDub).values({
				anilistId: anilistIds[1]!,
				episode: 2,
				releasedAt,
			});
		});

		beforeEach(async () => {
			await db.delete(seriesState).where(eq(seriesState.userId, profile));
			await db.delete(episodeProgress).where(eq(episodeProgress.userId, profile));
		});

		afterAll(async () => {
			try {
				if (anilistIds.length) {
					await db.delete(episodeDub).where(inArray(episodeDub.anilistId, anilistIds));
				}
				await db.delete(series).where(inArray(series.id, ids));
			} finally {
				await closeDatabase();
			}
		});

		test("one watched episode follows later episodes and dubs without a watchlist entry", async () => {
			await db.insert(episodeProgress).values({
				userId: profile,
				seriesId: first,
				episode: 1,
				positionSeconds: 1440,
				durationSeconds: 1440,
				finished: true,
				watchedAt: followedAt,
			});
			const result = await getNotifications(profile, {}, now);
			expect(result.items.map((item) => item.id).sort()).toEqual(
				[`${second}:1`, `${second}:2`, `${second}:2:dub`, `${third}:2`].sort(),
			);
			expect(await db.select().from(seriesState).where(eq(seriesState.userId, profile))).toEqual(
				[],
			);
		});

		test("a completed first season follows all releases in unsaved later seasons", async () => {
			await db.insert(seriesState).values({
				userId: profile,
				seriesId: first,
				status: "completed",
				addedAt: followedAt,
				statusChangedAt: followedAt,
			});
			const result = await getNotifications(profile, {}, now);
			expect(result.items.some((item) => item.id === `${second}:2`)).toBe(true);
			expect(result.items.some((item) => item.id === `${second}:2:dub`)).toBe(true);
			expect(result.items.some((item) => item.series.id === spinOff)).toBe(false);
		});

		test("partial playback follows the show even after a later watchlist addition", async () => {
			await db.insert(episodeProgress).values({
				userId: profile,
				seriesId: first,
				episode: 1,
				positionSeconds: 120,
				durationSeconds: 1440,
				finished: false,
				watchedAt: followedAt,
			});
			await db.insert(seriesState).values({
				userId: profile,
				seriesId: first,
				status: "watching",
				addedAt: now,
				statusChangedAt: now,
			});
			expect(
				(await getNotifications(profile, {}, now)).items.some((item) => item.id === `${second}:2`),
			).toBe(true);
		});

		test("a later watchlist addition keeps the earlier follow cutoff for its season", async () => {
			await db.insert(seriesState).values([
				{
					userId: profile,
					seriesId: first,
					status: "watching",
					addedAt: followedAt,
					statusChangedAt: followedAt,
				},
				{
					userId: profile,
					seriesId: second,
					status: "plan_to_watch",
					addedAt: now,
					statusChangedAt: now,
				},
			]);
			expect(
				(await getNotifications(profile, {}, now)).items.some((item) => item.id === `${second}:2`),
			).toBe(true);
		});

		test("dropping a watched entry prevents it from starting a follow", async () => {
			await db.insert(episodeProgress).values({
				userId: profile,
				seriesId: first,
				episode: 1,
				positionSeconds: 1440,
				durationSeconds: 1440,
				finished: true,
				watchedAt: followedAt,
			});
			await db.insert(seriesState).values({
				userId: profile,
				seriesId: first,
				status: "dropped",
				addedAt: followedAt,
				statusChangedAt: now,
			});
			expect(await getNotifications(profile, {}, now)).toEqual({ items: [], unread: 0 });
		});

		test("a dropped sequel is excluded while other connected seasons remain followed", async () => {
			await db.insert(seriesState).values([
				{
					userId: profile,
					seriesId: first,
					status: "completed",
					addedAt: followedAt,
					statusChangedAt: followedAt,
				},
				{
					userId: profile,
					seriesId: second,
					status: "dropped",
					addedAt: followedAt,
					statusChangedAt: now,
				},
			]);
			const result = await getNotifications(profile, {}, now);
			expect(result.items.map((item) => item.id)).toEqual([`${third}:2`]);
		});

		test("watching after the releases does not notify about older episodes or dubs", async () => {
			await db.insert(episodeProgress).values({
				userId: profile,
				seriesId: first,
				episode: 1,
				positionSeconds: 120,
				durationSeconds: 1440,
				finished: false,
				watchedAt: now,
			});
			expect(await getNotifications(profile, {}, now)).toEqual({ items: [], unread: 0 });
		});
	},
);
