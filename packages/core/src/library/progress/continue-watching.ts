import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../database/client";
import { continueWatchingDismissal, libraryEntry } from "../../database/schema";
import { assertSeriesExists, toSeriesCards } from "../../series/queries";
import { continuePoint, type ContinueWatchingItem } from "./resume";
import { loadCheckpoints, loadTitles } from "./titles";

/**
 * Builds the "continue watching" row: one entry per recently played title,
 * most recent first.
 *
 * The row is read from episode progress alone; library status is not a
 * way into it. Titles with nothing left to continue are left out (see
 * {@link continuePoint}), as are titles the user dropped or dismissed from
 * the row and has not played since.
 */
export async function getContinueWatching(
	userId: string,
	options: {
		limit?: number;
		/** Only these titles, such as a title's page or a page of search results: at most one entry each. */
		seriesIds?: readonly string[];
	} = {},
): Promise<ContinueWatchingItem[]> {
	const only = options.seriesIds;
	if (only?.length === 0) {
		return [];
	}

	const limit = options.limit ?? only?.length ?? 20;
	const [checkpoints, hidden] = await Promise.all([
		loadCheckpoints(userId, only),
		hiddenTitles(userId, only),
	]);

	// Over-fetch, because some titles drop out once their episodes are known.
	const candidates = [...checkpoints]
		.filter(([seriesId, progress]) => {
			const hiddenAt = [hidden.dismissed.get(seriesId), hidden.dropped.get(seriesId)];
			return hiddenAt.every((at) => at === undefined || at < progress[0]!.eventAt);
		})
		.slice(0, limit * 2);
	if (candidates.length === 0) {
		return [];
	}

	const titles = await loadTitles(candidates.map(([seriesId]) => seriesId));
	const cards = await toSeriesCards([...titles.series.values()]);

	return candidates
		.flatMap(([seriesId, progress]): ContinueWatchingItem[] => {
			const card = cards.get(seriesId);
			const point = card ? continuePoint(titles.episodes(seriesId), progress) : null;
			return card && point
				? [
						{
							series: card,
							...point,
							lastWatchedAt: progress[0]!.eventAt,
						},
					]
				: [];
		})
		.slice(0, limit);
}

/**
 * Removes a title from "continue watching" until the user plays it again.
 * It does not change the title's library status or anything else about it.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function dismissFromContinueWatching(userId: string, seriesId: string) {
	await assertSeriesExists(seriesId);
	const dismissedAt = new Date();
	await db
		.insert(continueWatchingDismissal)
		.values({
			userId,
			seriesId,
			dismissedAt,
		})
		.onConflictDoUpdate({
			target: [continueWatchingDismissal.userId, continueWatchingDismissal.seriesId],
			set: {
				dismissedAt,
			},
		});
}

/**
 * The titles hidden from the row until played again: when each dismissed
 * one was dismissed, and when each dropped one was dropped.
 */
async function hiddenTitles(userId: string, seriesIds: readonly string[] | undefined) {
	const [dismissed, dropped] = await Promise.all([
		db
			.select()
			.from(continueWatchingDismissal)
			.where(
				and(
					eq(continueWatchingDismissal.userId, userId),
					seriesIds ? inArray(continueWatchingDismissal.seriesId, [...seriesIds]) : undefined,
				),
			),
		db
			.select({
				seriesId: libraryEntry.seriesId,
				droppedAt: libraryEntry.updatedAt,
			})
			.from(libraryEntry)
			.where(
				and(
					eq(libraryEntry.userId, userId),
					seriesIds ? inArray(libraryEntry.seriesId, [...seriesIds]) : undefined,
					eq(libraryEntry.status, "dropped"),
				),
			),
	]);

	return {
		dismissed: new Map(dismissed.map((row) => [row.seriesId, row.dismissedAt.toISOString()])),
		dropped: new Map(dropped.map((row) => [row.seriesId, row.droppedAt.toISOString()])),
	};
}
