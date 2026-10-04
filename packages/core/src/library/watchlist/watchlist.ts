import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { anime, series, seriesState } from "../../database/schema";
import type { SeriesCard } from "../../series/models";
import { assertSeriesExists, toSeriesCards } from "../../series/queries";
import { clearSeriesState } from "../state";
import { statusAfterPlayback, type WatchlistStatus } from "./status";

/** A series on a user's watchlist. */
export interface WatchlistEntry {
	series: SeriesCard;
	status: WatchlistStatus;
	/** When the series was put on the watchlist, as an ISO 8601 timestamp. */
	addedAt: string;
	/** When its status last changed, as an ISO 8601 timestamp. */
	updatedAt: string;
}

/** Lists a user's watchlist, the most recently changed first. */
export async function getWatchlist(userId: string): Promise<WatchlistEntry[]> {
	const rows = await db
		.select({
			series,
			status: seriesState.status,
			addedAt: seriesState.addedAt,
			statusChangedAt: seriesState.statusChangedAt,
		})
		.from(seriesState)
		.innerJoin(series, eq(series.id, seriesState.seriesId))
		.where(and(eq(seriesState.userId, userId), isNotNull(seriesState.status)))
		.orderBy(desc(seriesState.statusChangedAt));
	const cards = await toSeriesCards(rows.map((row) => row.series));

	return rows.flatMap((row) => {
		const card = cards.get(row.series.id);
		return card && row.status && row.addedAt && row.statusChangedAt
			? [
					{
						series: card,
						status: row.status,
						addedAt: row.addedAt.toISOString(),
						updatedAt: row.statusChangedAt.toISOString(),
					},
				]
			: [];
	});
}

/**
 * Puts a series on a user's watchlist with a status, or changes the status
 * of one already there. Picking the status it has changes nothing.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function setWatchlistStatus(
	userId: string,
	seriesId: string,
	status: WatchlistStatus,
) {
	await assertSeriesExists(seriesId);
	await db
		.insert(seriesState)
		.values({
			userId,
			seriesId,
			status,
			addedAt: sql`now()`,
			statusChangedAt: sql`now()`,
		})
		.onConflictDoUpdate({
			target: [seriesState.userId, seriesState.seriesId],
			set: {
				status,
				addedAt: sql`coalesce(${seriesState.addedAt}, now())`,
				statusChangedAt: sql`now()`,
			},
			setWhere: sql`${seriesState.status} is distinct from ${status}`,
		});
}

/** Takes a series off a user's watchlist. Their progress in it stays. */
export async function removeFromWatchlist(userId: string, seriesId: string) {
	await clearSeriesState(userId, seriesId, {
		watchlist: true,
	});
}

/**
 * Moves a series' watchlist status on after the user played one of its
 * episodes, as {@link statusAfterPlayback} says. Called by `saveProgress`.
 */
export async function updateWatchlistAfterPlayback(
	userId: string,
	seriesId: string,
	playback: {
		episode: number;
		finished: boolean;
	},
) {
	const [[current], [title]] = await Promise.all([
		db
			.select({
				status: seriesState.status,
			})
			.from(seriesState)
			.where(and(eq(seriesState.userId, userId), eq(seriesState.seriesId, seriesId)))
			.limit(1),
		db
			.select({
				status: series.status,
				episodes: sql<number | null>`(${anime.media} ->> 'episodes')::int`,
			})
			.from(series)
			.leftJoin(anime, eq(anime.anilistId, series.anilistId))
			.where(eq(series.id, seriesId))
			.limit(1),
	]);
	const next = statusAfterPlayback(current?.status ?? null, {
		finished: playback.finished,
		isFinale:
			title?.status === "FINISHED" && title.episodes !== null && playback.episode >= title.episodes,
	});

	if (next !== null && next !== current?.status) {
		await setWatchlistStatus(userId, seriesId, next);
	}
}
