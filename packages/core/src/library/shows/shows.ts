import { and, desc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "../../database/client";
import {
	droppedSeries,
	episodeProgress,
	profileShow,
	series,
	seriesEntry,
	seriesRelated,
	seriesSeason,
	watchedEpisode,
} from "../../database/schema";
import type { SeriesCard } from "../../series/models";
import { assertSeriesExists, getPlayableSeasons, toSeriesCards } from "../../series/queries";
import { getNextEpisodes, type NextEpisode } from "../progress/progress";
import { statusOf, type ShowStatus } from "./status";

/** A series in a user's Shows: one they saved to watch later, or started watching. */
export interface Show {
	series: SeriesCard;
	/** When the series entered the user's Shows, as an ISO 8601 timestamp. */
	addedAt: string;
	/**
	 * Where the user is with the series; see {@link ShowStatus}. Opening its
	 * page starts nothing, and a completed series stays completed when a new
	 * season comes out, which is `offered` instead. Clients show the status
	 * as it is and do not work it out again from `next`, `offered`, or the
	 * counts.
	 */
	status: ShowStatus;
	/** The episode to play next, as `SeriesProgress.next` tells it. */
	next: NextEpisode | null;
	/**
	 * The episode the series stops before, as `SeriesProgress.offered` tells
	 * it. On a `completed` series, it is the part that came out since, or
	 * that the user never started.
	 */
	offered: NextEpisode | null;
	/** How many episodes of the series can be played, in all of its seasons. */
	episodeCount: number;
	/** How many of those episodes the user watched. */
	watchedCount: number;
	/**
	 * When the user last had to do with the series: played an episode of it,
	 * or, before that, added it. An ISO 8601 timestamp.
	 */
	activeAt: string;
}

/**
 * Lists a user's Shows, the most recently active first: the series they
 * saved, and the ones they started watching, each once however many of its
 * seasons they watched. Dropped series are among them, with the status
 * `dropped`.
 */
export async function getShows(userId: string): Promise<Show[]> {
	const playedAt = sql<Date | null>`(
		select max(${episodeProgress.watchedAt})
		from ${episodeProgress}
		inner join ${seriesSeason} on ${seriesSeason.id} = ${episodeProgress.seasonId}
		where ${episodeProgress.userId} = ${profileShow.userId}
			and ${seriesSeason.seriesId} = ${profileShow.seriesId}
	)`.mapWith(profileShow.addedAt);
	const rows = await db
		.select({
			series,
			addedAt: profileShow.addedAt,
			playedAt,
			droppedAt: droppedSeries.droppedAt,
		})
		.from(profileShow)
		.innerJoin(series, eq(series.id, profileShow.seriesId))
		.leftJoin(
			droppedSeries,
			and(
				eq(droppedSeries.userId, profileShow.userId),
				eq(droppedSeries.seriesId, profileShow.seriesId),
			),
		)
		.where(eq(profileShow.userId, userId))
		.orderBy(desc(sql`coalesce(${playedAt}, ${profileShow.addedAt})`));

	const [cards, upNext, seasons, played, watched] = await Promise.all([
		toSeriesCards(rows.map((row) => row.series)),
		getNextEpisodes(userId),
		getPlayableSeasons(rows.map((row) => row.series.id)),
		db
			.selectDistinct({
				seasonId: episodeProgress.seasonId,
			})
			.from(episodeProgress)
			.where(eq(episodeProgress.userId, userId)),
		db
			.select({
				seasonId: watchedEpisode.seasonId,
				episode: watchedEpisode.episode,
				finishedAt: watchedEpisode.finishedAt,
			})
			.from(watchedEpisode)
			.where(eq(watchedEpisode.userId, userId)),
	]);
	const watchedKeys = new Map(
		watched.map((row) => [`${row.seasonId}:${row.episode}`, row.finishedAt]),
	);
	const activeSeasonIds = new Set([
		...played.map((row) => row.seasonId),
		...watched.map((row) => row.seasonId),
	]);

	return rows.flatMap((row): Show[] => {
		const card = cards.get(row.series.id);
		const listed = seasons.get(row.series.id) ?? [];
		const next = upNext.get(row.series.id)?.next ?? null;
		return card
			? [
					{
						series: card,
						addedAt: row.addedAt.toISOString(),
						status:
							row.droppedAt !== null
								? "dropped"
								: statusOf(listed, {
										seasonIds: new Set(
											listed
												.filter((season) => activeSeasonIds.has(season.id))
												.map((season) => season.id),
										),
										watched: watchedKeys,
										next,
									}),
						next,
						offered: upNext.get(row.series.id)?.offered ?? null,
						episodeCount: listed.reduce((total, season) => total + season.episodes.length, 0),
						watchedCount: listed.reduce(
							(total, season) =>
								total +
								season.episodes.filter((episode) => watchedKeys.has(`${season.id}:${episode}`))
									.length,
							0,
						),
						activeAt: (row.playedAt ?? row.addedAt).toISOString(),
					},
				]
			: [];
	});
}

/**
 * Saves a series to a user's Shows. A series already there stays as it is.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function addShow(userId: string, seriesId: string) {
	await assertSeriesExists(seriesId);
	await db
		.insert(profileShow)
		.values({
			userId,
			seriesId,
		})
		.onConflictDoNothing();
}

/**
 * Takes a series out of a user's Shows, and with it out of what
 * `getContinueWatching` lists. Their progress and history in it stay, so
 * playing an episode of it brings it back where they left off.
 */
export async function removeShow(userId: string, seriesId: string) {
	await db
		.delete(profileShow)
		.where(and(eq(profileShow.userId, userId), eq(profileShow.seriesId, seriesId)));
}

/** The series a user dropped, and the ones left out with them. */
export interface Dropped {
	/** The series the user dropped. */
	seriesIds: string[];
	/**
	 * The stored series related to a dropped one, such as its spin-offs and
	 * the sequels listed as shows of their own. They are not dropped, but
	 * are left out of what Sora suggests all the same.
	 */
	relatedSeriesIds: string[];
}

/**
 * Drops a whole series for a user, and puts it in their Shows so it can be
 * found there. Their progress and history in it stay. It leaves Continue
 * Watching, and it and the series related to it are no longer featured.
 *
 * Only {@link undropShow} ends a drop: new episodes do not, and neither
 * does playing one.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function dropShow(userId: string, seriesId: string) {
	await assertSeriesExists(seriesId);
	await db.transaction(async (tx) => {
		await tx
			.insert(droppedSeries)
			.values({
				userId,
				seriesId,
			})
			.onConflictDoNothing();
		await tx
			.insert(profileShow)
			.values({
				userId,
				seriesId,
			})
			.onConflictDoNothing();
	});
}

/** Ends a user's drop of a series; see {@link dropShow}. */
export async function undropShow(userId: string, seriesId: string) {
	await db
		.delete(droppedSeries)
		.where(and(eq(droppedSeries.userId, userId), eq(droppedSeries.seriesId, seriesId)));
}

/** Lists the series a user dropped, and the stored series related to them. */
export async function getDropped(userId: string): Promise<Dropped> {
	const dropped = await db
		.select({
			seriesId: droppedSeries.seriesId,
		})
		.from(droppedSeries)
		.where(eq(droppedSeries.userId, userId));
	const seriesIds = dropped.map((row) => row.seriesId);
	if (seriesIds.length === 0) {
		return {
			seriesIds,
			relatedSeriesIds: [],
		};
	}

	const related = await db
		.select({
			from: seriesRelated.seriesId,
			to: seriesEntry.seriesId,
		})
		.from(seriesRelated)
		.innerJoin(seriesEntry, eq(seriesEntry.anilistId, seriesRelated.anilistId))
		.where(
			and(or(inArray(seriesRelated.seriesId, seriesIds), inArray(seriesEntry.seriesId, seriesIds))),
		);

	return {
		seriesIds,
		relatedSeriesIds: [
			...new Set(related.flatMap((row) => [row.from, row.to])).difference(new Set(seriesIds)),
		],
	};
}
