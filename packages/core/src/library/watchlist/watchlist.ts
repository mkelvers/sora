import { and, desc, eq, isNotNull, ne, notExists, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { episodeProgress, seriesState } from "../../database/schema/library";
import { series, titleEpisode } from "../../database/schema/series";
import type { WatchlistEntry, WatchlistStatus, WatchlistStatusEntry } from "../../models/library";
import { toCards, titles } from "../../series/queries";
import { clearSeries } from "../state";
import { afterPlayback } from "./status";

export const watchlist = {
	/**
	 * Moves a series' watchlist status on after the user played one of its
	 * episodes, as {@link afterPlayback} says. Called by `saveProgress`.
	 */
	async followPlayback(
		userId: string,
		seriesId: string,
		playback: {
			episode: number;
			finished: boolean;
		},
	) {
		const [[current], [title], [unfinished]] = await Promise.all([
			db
				.select({
					status: seriesState.status,
				})
				.from(seriesState)
				.where(and(eq(seriesState.userId, userId), eq(seriesState.seriesId, seriesId)))
				.limit(1),
			db
				.select({
					episodes: sql<
						number | null
					>`(select max(${titleEpisode.number}) from ${titleEpisode} where ${titleEpisode.seriesId} = ${series.id})`,
					status: series.status,
				})
				.from(series)
				.where(eq(series.id, seriesId))
				.limit(1),
			db
				.select({
					count: sql<number>`count(*)::int`,
				})
				.from(titleEpisode)
				.where(
					and(
						eq(titleEpisode.seriesId, seriesId),
						ne(titleEpisode.number, playback.episode),
						notExists(
							db
								.select({
									one: sql`1`,
								})
								.from(episodeProgress)
								.where(
									and(
										eq(episodeProgress.userId, userId),
										eq(episodeProgress.seriesId, seriesId),
										eq(episodeProgress.episode, titleEpisode.number),
										eq(episodeProgress.finished, true),
									),
								),
						),
					),
				),
		]);

		const next = afterPlayback(current?.status ?? null, {
			finished: playback.finished,
			isFinale:
				title?.status === "FINISHED" &&
				title.episodes !== null &&
				playback.episode >= title.episodes,
			playedThrough: (unfinished?.count ?? 0) === 0,
		});

		if (next !== null && next !== current?.status) {
			await watchlist.set(userId, seriesId, next);
		}
	},

	/** Lists a user's watchlist, the most recently changed first. */
	async list(userId: string): Promise<WatchlistEntry[]> {
		const rows = await db
			.select({
				addedAt: seriesState.addedAt,
				series,
				status: seriesState.status,
				statusChangedAt: seriesState.statusChangedAt,
			})
			.from(seriesState)
			.innerJoin(series, eq(series.id, seriesState.seriesId))
			.where(and(eq(seriesState.userId, userId), isNotNull(seriesState.status)))
			.orderBy(desc(seriesState.statusChangedAt));

		const entries = rows.map((row) => row.series);

		const cards = await toCards(
			entries,
			entries.map((title) => title.id),
		);

		return rows.flatMap((row) => {
			const card = cards.get(row.series.id);

			const { addedAt, status, statusChangedAt } = row;
			const isListed = card && status && addedAt && statusChangedAt;

			if (!isListed) {
				return [];
			}

			return [
				{
					added_at: addedAt.toISOString(),
					series: card,
					status,
					updated_at: statusChangedAt.toISOString(),
				},
			];
		});
	},

	/** Takes a series off a user's watchlist. Their progress in it stays. */
	async remove(userId: string, seriesId: string) {
		await clearSeries(userId, seriesId, {
			watchlist: true,
		});
	},

	/**
	 * Puts a series on a user's watchlist with a status, or changes the status
	 * of one already there. Picking the status it has changes nothing.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 */
	async set(userId: string, seriesId: string, status: WatchlistStatus) {
		await titles.assertExists(seriesId);
		await db
			.insert(seriesState)
			.values({
				addedAt: sql`now()`,
				seriesId,
				status,
				statusChangedAt: sql`now()`,
				userId,
			})
			.onConflictDoUpdate({
				set: {
					addedAt: sql`coalesce(${seriesState.addedAt}, now())`,
					status,
					statusChangedAt: sql`now()`,
				},
				setWhere: sql`${seriesState.status} is distinct from ${status}`,
				target: [seriesState.userId, seriesState.seriesId],
			});
	},

	/**
	 * Lists the status of every title on a user's watchlist without loading
	 * their cards, for callers that only need to know what is listed.
	 */
	async statuses(userId: string): Promise<WatchlistStatusEntry[]> {
		const rows = await db
			.select({
				seriesId: seriesState.seriesId,
				status: seriesState.status,
			})
			.from(seriesState)
			.where(and(eq(seriesState.userId, userId), isNotNull(seriesState.status)));

		return rows.flatMap((row) => {
			if (row.status) {
				return [
					{
						series_id: row.seriesId,
						status: row.status,
					},
				];
			}

			return [];
		});
	},
};
