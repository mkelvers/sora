import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";

import { db } from "../../database/client";
import { playbackProgress, series, seriesEpisode, seriesSeason } from "../../database/schema";
import { InvalidInputError } from "../../errors";
import type { SeriesCard } from "../../series/models";
import { toSeriesCards } from "../../series/queries";

/** One episode a user played, as their history lists it. */
export interface HistoryItem {
	series: SeriesCard;
	seasonId: string;
	/** Such as "Season 2" or the film's title. */
	seasonTitle: string;
	/** Position within the season, from 1. */
	episode: number;
	episodeTitle: string | null;
	positionSeconds: number;
	durationSeconds: number;
	completed: boolean;
	/** ISO 8601 timestamp of when it was last played. */
	watchedAt: string;
}

/** A page of history, and where the next one starts. */
export interface HistoryPage {
	items: HistoryItem[];
	/** Pass as `after` for the next page, or `null` on the last page. */
	next: string | null;
}

/**
 * Lists the episodes a user played, most recent first: one item per
 * episode, at when they last played it. Episodes of titles no longer stored
 * are left out.
 *
 * @param options.after - The `next` of the previous page.
 * @throws {@link InvalidInputError} when `after` is not a `next` this returned.
 */
export async function getHistory(
	userId: string,
	options: {
		after?: string;
		limit?: number;
	} = {},
): Promise<HistoryPage> {
	const limit = options.limit ?? 50;
	const rows = await db
		.select({
			progress: playbackProgress,
			series,
			seasonId: seriesSeason.id,
			seasonTitle: seriesSeason.title,
			episode: seriesEpisode.number,
			episodeTitle: seriesEpisode.title,
		})
		.from(playbackProgress)
		.innerJoin(
			seriesEpisode,
			and(
				eq(seriesEpisode.anilistId, playbackProgress.anilistId),
				eq(seriesEpisode.anilistEpisode, playbackProgress.episode),
			),
		)
		.innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
		.innerJoin(series, eq(series.id, seriesSeason.seriesId))
		.where(
			and(eq(playbackProgress.userId, userId), options.after ? after(options.after) : undefined),
		)
		.orderBy(
			desc(playbackProgress.eventAt),
			desc(playbackProgress.anilistId),
			desc(playbackProgress.episode),
		)
		.limit(limit + 1);

	const page = rows.slice(0, limit);
	const cards = await toSeriesCards([
		...new Map(page.map((row) => [row.series.id, row.series])).values(),
	]);
	const last = page.at(-1);

	return {
		items: page.flatMap((row): HistoryItem[] => {
			const card = cards.get(row.series.id);
			return card
				? [
						{
							series: card,
							seasonId: row.seasonId,
							seasonTitle: row.seasonTitle,
							episode: row.episode,
							episodeTitle: row.episodeTitle,
							positionSeconds: row.progress.positionSeconds,
							durationSeconds: row.progress.durationSeconds,
							completed: row.progress.completed,
							watchedAt: row.progress.eventAt.toISOString(),
						},
					]
				: [];
		}),
		next:
			rows.length > limit && last
				? [
						last.progress.eventAt.toISOString(),
						last.progress.anilistId,
						last.progress.episode,
					].join("_")
				: null,
	};
}

/** The checkpoints after a page's last one, in the order {@link getHistory} lists them. */
function after(cursor: string): SQL | undefined {
	const [at, anilistId, episode] = cursor.split("_");
	const eventAt = new Date(at ?? "");
	if (
		Number.isNaN(eventAt.getTime()) ||
		!Number.isInteger(Number(anilistId)) ||
		!Number.isFinite(Number(episode))
	) {
		throw new InvalidInputError("Invalid history cursor");
	}

	return or(
		lt(playbackProgress.eventAt, eventAt),
		and(eq(playbackProgress.eventAt, eventAt), lt(playbackProgress.anilistId, Number(anilistId))),
		and(
			eq(playbackProgress.eventAt, eventAt),
			eq(playbackProgress.anilistId, Number(anilistId)),
			lt(playbackProgress.episode, Number(episode)),
		),
	);
}
