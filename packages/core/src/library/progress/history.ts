import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";

import { db } from "../../database/client";
import { playbackHistory, series, seriesEpisode, seriesSeason } from "../../database/schema";
import { InvalidInputError } from "../../errors";
import { locateEpisode } from "../../series/episodes";
import type { SeriesCard } from "../../series/models";
import { toSeriesCards } from "../../series/queries";

/**
 * One episode a user played, as their history lists it. Only playback puts
 * an episode here; marking it watched does not.
 */
export interface HistoryItem {
	series: SeriesCard;
	seasonId: string;
	/** Such as "Season 2" or the film's title. */
	seasonTitle: string;
	/** Position within the season, from 1. */
	episode: number;
	episodeTitle: string | null;
	/** How far its latest playback got. */
	positionSeconds: number;
	durationSeconds: number;
	/** ISO 8601 timestamp of when it was last played. */
	playedAt: string;
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
			history: playbackHistory,
			series,
			seasonId: seriesSeason.id,
			seasonTitle: seriesSeason.title,
			episode: seriesEpisode.number,
			episodeTitle: seriesEpisode.title,
		})
		.from(playbackHistory)
		.innerJoin(
			seriesEpisode,
			and(
				eq(seriesEpisode.anilistId, playbackHistory.anilistId),
				eq(seriesEpisode.anilistEpisode, playbackHistory.episode),
			),
		)
		.innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
		.innerJoin(series, eq(series.id, seriesSeason.seriesId))
		.where(
			and(eq(playbackHistory.userId, userId), options.after ? after(options.after) : undefined),
		)
		.orderBy(
			desc(playbackHistory.playedAt),
			desc(playbackHistory.anilistId),
			desc(playbackHistory.episode),
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
							positionSeconds: row.history.positionSeconds,
							durationSeconds: row.history.durationSeconds,
							playedAt: row.history.playedAt.toISOString(),
						},
					]
				: [];
		}),
		next:
			rows.length > limit && last
				? [last.history.playedAt.toISOString(), last.history.anilistId, last.history.episode].join(
						"_",
					)
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
		lt(playbackHistory.playedAt, eventAt),
		and(eq(playbackHistory.playedAt, eventAt), lt(playbackHistory.anilistId, Number(anilistId))),
		and(
			eq(playbackHistory.playedAt, eventAt),
			eq(playbackHistory.anilistId, Number(anilistId)),
			lt(playbackHistory.episode, Number(episode)),
		),
	);
}

/**
 * Takes one episode out of the user's history. Whether it is watched, and
 * where playback of it stands, stay as they are.
 *
 * @returns Whether it was in their history.
 * @throws {@link SeasonNotFoundError} when the season does not exist.
 * @throws {@link EpisodeNotFoundError} when the season has no such
 *   playable episode.
 */
export async function forgetEpisode(
	userId: string,
	seasonId: string,
	episode: number,
): Promise<boolean> {
	const located = await locateEpisode(seasonId, episode);
	const removed = await db
		.delete(playbackHistory)
		.where(
			and(
				eq(playbackHistory.userId, userId),
				eq(playbackHistory.anilistId, located.anilistId),
				eq(playbackHistory.episode, located.anilistEpisode),
			),
		)
		.returning({
			episode: playbackHistory.episode,
		});

	return removed.length > 0;
}
