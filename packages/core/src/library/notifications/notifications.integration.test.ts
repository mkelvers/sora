import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { day, defined } from "@sora/shared";
import { eq, inArray, sql } from "drizzle-orm";

import { closeDatabase, db } from "../../database/client";
import {
	episodeDub,
	episodeProgress,
	series,
	seriesEpisode,
	seriesRelated,
	seriesState,
} from "../../database/schema";
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
					anilistId: defined(anilistIds[index]),
					id,
					key: `anilist:${anilistIds[index]}`,
					kind: "standalone" as const,
					laidOutAt: now,
					title: `Notification test ${index}`,
				})),
			);
			await db.insert(seriesRelated).values([
				{ anilistId: defined(anilistIds[1]), position: 0, relation: "SEQUEL", seriesId: first },
				{ anilistId: defined(anilistIds[1]), position: 0, relation: "PREQUEL", seriesId: third },
				{ anilistId: defined(anilistIds[3]), position: 1, relation: "SIDE_STORY", seriesId: first },
			]);
			await db.insert(seriesEpisode).values([
				{ airedAt: new Date(now.getTime() - 40 * day), number: 1, seriesId: first },
				{ airedAt: new Date(now.getTime() - 5 * day), number: 1, seriesId: second },
				{ airedAt: releasedAt, number: 2, seriesId: second },
				{ airedAt: releasedAt, number: 2, seriesId: third },
				{ airedAt: releasedAt, number: 1, seriesId: spinOff },
			]);
			await db.insert(episodeDub).values({
				anilistId: defined(anilistIds[1]),
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
					for (const anilistId of anilistIds) {
						await db.execute(sql`select graphile_worker.remove_job(${`episodes:${anilistId}`})`);
					}
				}
				await db.delete(series).where(inArray(series.id, ids));
			} finally {
				await closeDatabase();
			}
		});

		test("one watched episode follows later episodes and dubs without a watchlist entry", async () => {
			await db.insert(episodeProgress).values({
				durationSeconds: 1440,
				episode: 1,
				finished: true,
				positionSeconds: 1440,
				seriesId: first,
				userId: profile,
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
				addedAt: followedAt,
				seriesId: first,
				status: "completed",
				statusChangedAt: followedAt,
				userId: profile,
			});
			const result = await getNotifications(profile, {}, now);
			expect(result.items.some((item) => item.id === `${second}:2`)).toBe(true);
			expect(result.items.some((item) => item.id === `${second}:2:dub`)).toBe(true);
			expect(result.items.some((item) => item.series.id === spinOff)).toBe(false);
		});

		test("a recent dub of an old episode still uses the full episode inventory", async () => {
			await db.insert(seriesState).values({
				addedAt: followedAt,
				seriesId: first,
				status: "completed",
				statusChangedAt: followedAt,
				userId: profile,
			});
			await db.insert(episodeDub).values({
				anilistId: defined(anilistIds[0]),
				episode: 1,
				releasedAt,
			});
			try {
				const result = await getNotifications(profile, {}, now);
				const dubbed = result.items.find((item) => item.id === `${first}:1:dub`);
				expect(dubbed?.series.episode_count).toBe(1);
				expect(dubbed?.first_episode).toBe(1);
			} finally {
				await db.delete(episodeDub).where(eq(episodeDub.anilistId, defined(anilistIds[0])));
			}
		});

		test("partial playback follows the show even after a later watchlist addition", async () => {
			await db.insert(episodeProgress).values({
				durationSeconds: 1440,
				episode: 1,
				finished: false,
				positionSeconds: 120,
				seriesId: first,
				userId: profile,
				watchedAt: followedAt,
			});
			await db.insert(seriesState).values({
				addedAt: now,
				seriesId: first,
				status: "watching",
				statusChangedAt: now,
				userId: profile,
			});
			expect(
				(await getNotifications(profile, {}, now)).items.some((item) => item.id === `${second}:2`),
			).toBe(true);
		});

		test("a later watchlist addition keeps the earlier follow cutoff for its season", async () => {
			await db.insert(seriesState).values([
				{
					addedAt: followedAt,
					seriesId: first,
					status: "watching",
					statusChangedAt: followedAt,
					userId: profile,
				},
				{
					addedAt: now,
					seriesId: second,
					status: "plan_to_watch",
					statusChangedAt: now,
					userId: profile,
				},
			]);
			expect(
				(await getNotifications(profile, {}, now)).items.some((item) => item.id === `${second}:2`),
			).toBe(true);
		});

		test("dropping a watched entry prevents it from starting a follow", async () => {
			await db.insert(episodeProgress).values({
				durationSeconds: 1440,
				episode: 1,
				finished: true,
				positionSeconds: 1440,
				seriesId: first,
				userId: profile,
				watchedAt: followedAt,
			});
			await db.insert(seriesState).values({
				addedAt: followedAt,
				seriesId: first,
				status: "dropped",
				statusChangedAt: now,
				userId: profile,
			});
			expect(await getNotifications(profile, {}, now)).toEqual({ items: [], unread: 0 });
		});

		test("a dropped sequel is excluded while other connected seasons remain followed", async () => {
			await db.insert(seriesState).values([
				{
					addedAt: followedAt,
					seriesId: first,
					status: "completed",
					statusChangedAt: followedAt,
					userId: profile,
				},
				{
					addedAt: followedAt,
					seriesId: second,
					status: "dropped",
					statusChangedAt: now,
					userId: profile,
				},
			]);
			const result = await getNotifications(profile, {}, now);
			expect(result.items.map((item) => item.id)).toEqual([`${third}:2`]);
		});

		test("watching after the releases does not notify about older episodes or dubs", async () => {
			await db.insert(episodeProgress).values({
				durationSeconds: 1440,
				episode: 1,
				finished: false,
				positionSeconds: 120,
				seriesId: first,
				userId: profile,
				watchedAt: now,
			});
			expect(await getNotifications(profile, {}, now)).toEqual({ items: [], unread: 0 });
		});
	},
);
