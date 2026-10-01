import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";

import { db } from "../../database/client";
import {
	episodeProgress,
	series,
	seriesEpisode,
	seriesSeason,
	watchedEpisode,
} from "../../database/schema";
import { InvalidInputError } from "../../errors";
import { effectiveStill } from "../../series/edges";
import type { SeriesCard } from "../../series/models";
import { toSeriesCards } from "../../series/queries";
import type { SeasonKind } from "../../series/seasons";

/** One episode a user finished or marked watched, as their history lists it. */
export interface HistoryItem {
	series: SeriesCard;
	seasonId: string;
	/** The season's title, such as "Season 2"; see `Season.title`. */
	seasonTitle: string;
	seasonKind: SeasonKind;
	/** Position within the season, from 1. */
	episode: number;
	episodeTitle: string | null;
	/** The episode's still image, or `null` when it has none. */
	episodeStillUrl: string | null;
	/**
	 * How long the episode ran when the user last played it, in seconds;
	 * `null` for one they marked watched and never played.
	 */
	durationSeconds: number | null;
	/** When the user first finished the episode, or marked it, as an ISO 8601 timestamp. */
	finishedAt: string;
}

/** A page of history, and where the next one starts. */
export interface HistoryPage {
	items: HistoryItem[];
	/** Pass as `after` for the next page, or `null` on the last page. */
	next: string | null;
}

/**
 * Lists the episodes a user finished, the most recently finished first.
 *
 * An episode is listed once, at when the user first finished it: playing it
 * again neither lists it again nor moves it up. An episode marked watched
 * (see `markSeason`) is listed at when it was marked. An episode its season
 * no longer lists is left out.
 *
 * @param options.after - The `next` of the previous page.
 * @param options.limit - Items per page; 50 when omitted.
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
			watched: watchedEpisode,
			series,
			seasonTitle: seriesSeason.title,
			seasonKind: seriesSeason.kind,
			episodeTitle: seriesEpisode.title,
			episodeStillUrl: effectiveStill,
			durationSeconds: episodeProgress.durationSeconds,
		})
		.from(watchedEpisode)
		.innerJoin(
			seriesEpisode,
			and(
				eq(seriesEpisode.seasonId, watchedEpisode.seasonId),
				eq(seriesEpisode.number, watchedEpisode.episode),
			),
		)
		.innerJoin(seriesSeason, eq(seriesSeason.id, watchedEpisode.seasonId))
		.innerJoin(series, eq(series.id, seriesSeason.seriesId))
		.leftJoin(
			episodeProgress,
			and(
				eq(episodeProgress.userId, watchedEpisode.userId),
				eq(episodeProgress.seasonId, watchedEpisode.seasonId),
				eq(episodeProgress.episode, watchedEpisode.episode),
			),
		)
		.where(and(eq(watchedEpisode.userId, userId), options.after ? after(options.after) : undefined))
		.orderBy(
			desc(watchedEpisode.finishedAt),
			desc(watchedEpisode.seasonId),
			desc(watchedEpisode.episode),
		)
		.limit(limit + 1);

	const page = rows.slice(0, limit);
	const cards = await toSeriesCards([
		...new Map(page.map((row) => [row.series.id, row.series])).values(),
	]);
	const last = page.at(-1)?.watched;

	return {
		items: page.flatMap((row): HistoryItem[] => {
			const card = cards.get(row.series.id);
			return card
				? [
						{
							series: card,
							seasonId: row.watched.seasonId,
							seasonTitle: row.seasonTitle,
							seasonKind: row.seasonKind,
							episode: row.watched.episode,
							episodeTitle: row.episodeTitle,
							episodeStillUrl: row.episodeStillUrl,
							durationSeconds: row.durationSeconds,
							finishedAt: row.watched.finishedAt.toISOString(),
						},
					]
				: [];
		}),
		next:
			rows.length > limit && last
				? [last.finishedAt.toISOString(), last.seasonId, last.episode].join("_")
				: null,
	};
}

/** The episodes after a page's last one, in the order {@link getHistory} lists them. */
function after(cursor: string): SQL | undefined {
	const [at, seasonId, number] = cursor.split("_");
	const finishedAt = new Date(at ?? "");
	const episode = Number(number);
	if (Number.isNaN(finishedAt.getTime()) || !seasonId || !Number.isInteger(episode)) {
		throw new InvalidInputError("Invalid history cursor");
	}

	return or(
		lt(watchedEpisode.finishedAt, finishedAt),
		and(eq(watchedEpisode.finishedAt, finishedAt), lt(watchedEpisode.seasonId, seasonId)),
		and(
			eq(watchedEpisode.finishedAt, finishedAt),
			eq(watchedEpisode.seasonId, seasonId),
			lt(watchedEpisode.episode, episode),
		),
	);
}
