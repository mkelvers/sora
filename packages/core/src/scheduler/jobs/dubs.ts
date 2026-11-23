import { hour, minute, sequence } from "@sora/shared";
import { and, eq, gt, inArray, isNotNull, lte } from "drizzle-orm";
import type { Task } from "graphile-worker";

import { db } from "../../database/client";
import { animeScheduleRelease, animeScheduleShow } from "../../database/schema/playback";
import { series } from "../../database/schema/series";
import { getStoredUnits } from "../../playback/episodes/episodes";
import { aniKoto } from "../../playback/providers/registry";
import { schedulePoll } from "../queue";

/** The graphile-worker task that schedules looks on AniKoto for the day's dubs. */
export const syncScheduleTask = "sync-dub-schedule";

/**
 * Schedules a look on AniKoto (see `pollAniKoto`) for each dub AnimeSchedule
 * expects within {@link scheduleAheadMs}, shortly after it comes out, so a
 * dub shows up within minutes of AniKoto carrying it. AniList has no dub
 * schedule.
 *
 * Runs daily on AnimeSchedule's timetable as `timetables.sync` stores it,
 * without asking AnimeSchedule itself. Only dubs of stored series that
 * AniKoto does not carry yet are looked for.
 */
export const syncSchedule: Task = async (_payload, helpers) => {
	/**
	 * How long after AnimeSchedule's time a dub is first looked for on
	 * AniKoto. Of a week's dubs, AniKoto changed the series 8 to 35 minutes
	 * after it.
	 */
	const firstLookMs = 5 * minute;

	/** How far ahead each daily run schedules dubs: a day, with room for a run that starts late. */
	const scheduleAheadMs = 26 * hour;

	const now = new Date();
	const until = new Date(now.getTime() + scheduleAheadMs);

	const releases = await db
		.select({
			airsAt: animeScheduleRelease.airsAt,
			anilistId: animeScheduleShow.anilistId,
			episode: animeScheduleRelease.episode,
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

	let storedQuery:
		| PromiseLike<
				{
					anilistId: number;
				}[]
		  >
		| {
				anilistId: number;
		  }[] = [];

	if (ids.length > 0) {
		storedQuery = db
			.select({
				anilistId: series.anilistId,
			})
			.from(series)
			.where(inArray(series.anilistId, ids));
	}

	const [stored, units] = await Promise.all([storedQuery, getStoredUnits(ids)]);

	const storedIds = new Set(stored.map((entry) => entry.anilistId));

	const uncarried = releases.flatMap((release) => {
		const { anilistId } = release;

		if (!anilistId || !storedIds.has(anilistId)) {
			return [];
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
			return [];
		}

		return [
			{
				anilistId,
				release,
			},
		];
	});

	await sequence.all(uncarried, ({ anilistId, release }) =>
		schedulePoll(
			{
				anilistId,
				attempt: 0,
				episode: release.episode,
				language: "dub",
			},
			new Date(release.airsAt.getTime() + firstLookMs),
		),
	);
	const scheduled = uncarried.length;

	helpers.logger.info(
		`Scheduled looks on AniKoto for ${scheduled} of ${releases.length} dubs AnimeSchedule expects`,
	);
};
