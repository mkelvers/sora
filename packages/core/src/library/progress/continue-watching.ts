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
 * way into it. Only a season the user started is continued: a title whose
 * next episode starts a season is left out, as that season is offered
 * rather than pushed. Titles with nothing left to continue are left out
 * (see {@link continuePoint}), as are dropped titles and titles the user
 * dismissed from the row and has not played since.
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
	const [checkpoints, dismissed, dropped] = await Promise.all([
		loadCheckpoints(userId, only),
		dismissedTitles(userId, only),
		droppedTitles(userId, only),
	]);

	// Over-fetch, because some titles drop out once their episodes are known.
	const candidates = [...checkpoints]
		.filter(([seriesId, progress]) => {
			if (dropped.has(seriesId)) {
				return false;
			}
			const dismissedAt = dismissed.get(seriesId);
			return dismissedAt === undefined || dismissedAt < progress[0]!.eventAt;
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
			const started = progress.some((checkpoint) => checkpoint.seasonId === point?.seasonId);
			return card && point && started
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

/** When each title dismissed from the row was dismissed. */
async function dismissedTitles(userId: string, seriesIds: readonly string[] | undefined) {
	const rows = await db
		.select()
		.from(continueWatchingDismissal)
		.where(
			and(
				eq(continueWatchingDismissal.userId, userId),
				seriesIds ? inArray(continueWatchingDismissal.seriesId, [...seriesIds]) : undefined,
			),
		);

	return new Map(rows.map((row) => [row.seriesId, row.dismissedAt.toISOString()]));
}

/** The titles a user dropped, among `only` when given. */
async function droppedTitles(userId: string, only?: readonly string[]): Promise<Set<string>> {
	const rows = await db
		.select({
			seriesId: libraryEntry.seriesId,
		})
		.from(libraryEntry)
		.where(
			and(
				eq(libraryEntry.userId, userId),
				eq(libraryEntry.status, "dropped"),
				only ? inArray(libraryEntry.seriesId, [...only]) : undefined,
			),
		);
	return new Set(rows.map((row) => row.seriesId));
}
