import { and, eq, gt, inArray, isNotNull, lte } from "drizzle-orm";
import type { Task } from "graphile-worker";

import { db } from "../../database/client";
import { animeScheduleRelease, animeScheduleShow, series } from "../../database/schema";
import { getStoredUnits } from "../../playback/episodes/episodes";
import { aniKoto } from "../../playback/providers/registry";
import { hour, minute } from "../../time";
import { scheduleAniKotoPoll } from "../queue";

/** How far ahead each daily run schedules dubs: a day, with room for a run that starts late. */
const scheduleAheadMs = 26 * hour;

/**
 * How long after AnimeSchedule's time a dub is first looked for on
 * AniKoto. Of a week's dubs, AniKoto changed the series 8 to 35 minutes
 * after it.
 */
const firstLookDelayMs = 5 * minute;

/** The graphile-worker task that schedules looks on AniKoto for the day's dubs. */
export const syncDubScheduleTask = "sync-dub-schedule";

/**
 * Schedules a look on AniKoto (see `pollAniKoto`) for each dub AnimeSchedule
 * expects within {@link scheduleAheadMs}, shortly after it comes out, so a
 * dub shows up within minutes of AniKoto carrying it. AniList has no dub
 * schedule.
 *
 * Runs daily on AnimeSchedule's timetable as `syncTimetables` stores it,
 * without asking AnimeSchedule itself. Only dubs of stored series that
 * AniKoto does not carry yet are looked for.
 */
export const syncDubSchedule: Task = async (_payload, helpers) => {
	const now = new Date();
	const until = new Date(now.getTime() + scheduleAheadMs);
	const releases = await db
		.select({
			anilistId: animeScheduleShow.anilistId,
			episode: animeScheduleRelease.episode,
			airsAt: animeScheduleRelease.airsAt,
		})
		.from(animeScheduleRelease)
		.innerJoin(animeScheduleShow, eq(animeScheduleShow.route, animeScheduleRelease.route))
		.where(
			and(
				eq(animeScheduleRelease.airType, "dub"),
				gt(animeScheduleRelease.airsAt, now),
				lte(animeScheduleRelease.airsAt, until),
				isNotNull(animeScheduleShow.anilistId),
			),
		);
	const ids = releases.flatMap((release) => release.anilistId ?? []);
	const [stored, units] = await Promise.all([
		ids.length > 0
			? db
					.select({
						anilistId: series.anilistId,
					})
					.from(series)
					.where(inArray(series.anilistId, ids))
			: [],
		getStoredUnits(ids),
	]);
	const storedIds = new Set(stored.map((entry) => entry.anilistId));

	let scheduled = 0;
	for (const release of releases) {
		const { anilistId } = release;
		if (!anilistId || !storedIds.has(anilistId)) {
			continue;
		}

		const isCarried = units.some(
			(entry) =>
				entry.anilistId === anilistId &&
				entry.provider === aniKoto.id &&
				entry.units.some(
					(unit) => unit.number >= release.episode && unit.languages?.includes("dub"),
				),
		);
		if (isCarried) {
			continue;
		}

		await scheduleAniKotoPoll(
			{
				anilistId,
				episode: release.episode,
				language: "dub",
				attempt: 0,
			},
			new Date(release.airsAt.getTime() + firstLookDelayMs),
		);
		scheduled += 1;
	}

	helpers.logger.info(
		`Scheduled looks on AniKoto for ${scheduled} of ${releases.length} dubs AnimeSchedule expects`,
	);
};
