import type { Task } from "graphile-worker";

import { syncTimetables } from "../../animeschedule/timetable";
import { providerHttp } from "../../playback/providers/registry";
import { storedSeriesIds } from "../../series/store";
import { scheduleSeriesStore } from "../queue";

/** The graphile-worker task that keeps AnimeSchedule's timetable stored for the release calendar. */
export const syncTimetablesTask = "sync-timetables";

/**
 * Stores AnimeSchedule's timetable from last week to next week (see
 * {@link syncTimetables}) and queues each AniList entry in it that no
 * stored series holds yet, so its episodes join the release calendar once
 * stored.
 *
 * Runs hourly, as episodes are delayed and moved: about 72 requests to
 * AnimeSchedule a day, plus one for each show it has not seen before.
 */
export const syncTimetablesJob: Task = async (_payload, helpers) => {
	const anilistIds = await syncTimetables(providerHttp);
	const stored = await storedSeriesIds(anilistIds);
	const missing = anilistIds.filter((anilistId) => !stored.has(anilistId));
	for (const anilistId of missing) {
		await scheduleSeriesStore(anilistId, "backfill");
	}

	helpers.logger.info(
		`Stored AnimeSchedule's timetable for ${anilistIds.length} AniList entries; queued ${missing.length} not stored yet`,
	);
};
