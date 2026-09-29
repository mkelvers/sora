import { inArray } from "drizzle-orm";
import type { Task } from "graphile-worker";

import {
	fetchDubReleases,
	isoWeek,
	resolveAnimeScheduleShows,
} from "../../animeschedule/timetable";
import { db } from "../../database/client";
import { seriesEntry } from "../../database/schema";
import { getStoredUnits } from "../../playback/episodes/episodes";
import { aniKoto, providerHttp } from "../../playback/providers/registry";
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
 * Runs daily, and asks AnimeSchedule's API for its timetable once, or
 * twice when the day ahead reaches into next week, plus once for each show
 * it has not seen before; see {@link resolveAnimeScheduleShows}. Only dubs
 * of stored series that AniKoto does not carry yet are looked for.
 */
export const syncDubSchedule: Task = async (_payload, helpers) => {
	const now = new Date();
	const until = new Date(now.getTime() + scheduleAheadMs);
	const weeks = new Map(
		[isoWeek(now), isoWeek(until)].map((week) => [`${week.year}-${week.week}`, week]),
	);
	const releases = (
		await Promise.all([...weeks.values()].map((week) => fetchDubReleases(providerHttp, week)))
	)
		.flat()
		.filter((release) => release.airsAt > now && release.airsAt <= until);

	const shows = await resolveAnimeScheduleShows(
		providerHttp,
		releases.map((release) => release.route),
	);
	const ids = releases.flatMap((release) => shows.get(release.route) ?? []);
	const [stored, units] = await Promise.all([
		ids.length > 0
			? db
					.selectDistinct({
						anilistId: seriesEntry.anilistId,
					})
					.from(seriesEntry)
					.where(inArray(seriesEntry.anilistId, ids))
			: [],
		getStoredUnits(ids),
	]);
	const storedIds = new Set(stored.map((entry) => entry.anilistId));

	let scheduled = 0;
	for (const release of releases) {
		const anilistId = shows.get(release.route);
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
