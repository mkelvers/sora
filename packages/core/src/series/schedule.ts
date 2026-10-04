import { and, asc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";

import { db } from "../database/client";
import { animeScheduleRelease, animeScheduleShow, series } from "../database/schema";
import { InvalidInputError } from "../errors";
import type { ScheduledEpisode } from "../models/series";
import { day } from "../time";
import { anilistEpisodeKey } from "./episodes";
import { toSeriesCards } from "./queries";
import { storedSeriesIds } from "./store";

/** The longest window {@link getAiringSchedule} accepts. */
const maximumScheduleWindowMs = 14 * day;

/**
 * How far past the window {@link getAiringSchedule} looks for an episode's
 * other time, so an episode whose raw broadcast and subbed stream fall on
 * either side of the window's edge is listed once. Subs follow the raw
 * broadcast by up to a few hours.
 */
const pairingMarginMs = day;

/**
 * Lists episodes coming out between `from` (inclusive) and `until`
 * (exclusive) as AnimeSchedule's timetable has them, in order. An episode
 * is listed once subbed and once dubbed, as it comes out.
 *
 * Every raw broadcast counts as subbed, since subs follow it wherever
 * episodes are streamed from; an official subbed stream, where there is
 * one, gives the time instead.
 *
 * Reads only the database, which the scheduler keeps from last week to next
 * week; see `syncTimetables`. Only stored titles are listed: the scheduler
 * queues the rest as it stores the timetable, and they appear once stored.
 *
 * @throws {@link InvalidInputError} when the window is empty or longer than 14 days.
 */
export async function getAiringSchedule(from: Date, until: Date): Promise<ScheduledEpisode[]> {
	const windowMs = until.getTime() - from.getTime();
	if (!(windowMs > 0 && windowMs <= maximumScheduleWindowMs)) {
		throw new InvalidInputError("The schedule window must be between 0 and 14 days long");
	}

	const releases = await db
		.select({
			anilistId: animeScheduleShow.anilistId,
			airType: animeScheduleRelease.airType,
			episode: animeScheduleRelease.episode,
			airsAt: animeScheduleRelease.airsAt,
		})
		.from(animeScheduleRelease)
		.innerJoin(animeScheduleShow, eq(animeScheduleShow.route, animeScheduleRelease.route))
		.where(
			and(
				gte(animeScheduleRelease.airsAt, new Date(from.getTime() - pairingMarginMs)),
				lt(animeScheduleRelease.airsAt, new Date(until.getTime() + pairingMarginMs)),
				isNotNull(animeScheduleShow.anilistId),
			),
		)
		.orderBy(asc(animeScheduleRelease.airsAt), asc(animeScheduleRelease.route));

	const chosen = new Map<
		string,
		{
			anilistId: number;
			episode: number;
			airType: "sub" | "dub";
			fromSubStream: boolean;
			airsAt: Date;
		}
	>();
	for (const release of releases) {
		if (release.anilistId === null) {
			continue;
		}

		const airType = release.airType === "dub" ? "dub" : "sub";
		const key = `${anilistEpisodeKey(release.anilistId, release.episode)}:${airType}`;
		const fromSubStream = release.airType === "sub";
		if (!chosen.get(key)?.fromSubStream) {
			chosen.set(key, {
				anilistId: release.anilistId,
				episode: release.episode,
				airType,
				fromSubStream,
				airsAt: release.airsAt,
			});
		}
	}
	const broadcasts = [...chosen.values()]
		.filter((broadcast) => broadcast.airsAt >= from && broadcast.airsAt < until)
		.toSorted((left, right) => left.airsAt.getTime() - right.airsAt.getTime());
	const seriesIds = await storedSeriesIds(broadcasts.map((broadcast) => broadcast.anilistId));
	const rows =
		seriesIds.size > 0
			? await db
					.select()
					.from(series)
					.where(inArray(series.id, [...seriesIds.values()]))
			: [];
	const cards = await toSeriesCards(rows);

	return broadcasts.flatMap((broadcast) => {
		const seriesId = seriesIds.get(broadcast.anilistId);
		const card = seriesId ? cards.get(seriesId) : undefined;
		return card
			? [
					{
						series: card,
						episode: broadcast.episode,
						air_type: broadcast.airType,
						airing_at: broadcast.airsAt.toISOString(),
					},
				]
			: [];
	});
}
