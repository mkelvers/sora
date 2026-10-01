import { and, desc, eq, lt, or, sql, type Column, type SQL } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";

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

/** One episode a user played or marked watched, as their history lists it. */
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
	 * Whether the user watched the episode: finished it at some point, or
	 * marked it. One they only played part of is not watched.
	 */
	watched: boolean;
	/**
	 * Where the user stopped when they last played the episode, in seconds
	 * from the start; `null` for one they marked watched and never played.
	 */
	positionSeconds: number | null;
	/**
	 * How long the episode ran when the user last played it, in seconds;
	 * `null` for one they marked watched and never played.
	 */
	durationSeconds: number | null;
	/**
	 * When the episode took its place in the history, as an ISO 8601
	 * timestamp: when the user first finished or marked it, or, for one not
	 * watched yet, when they last played it.
	 */
	listedAt: string;
}

/** A page of history, and where the next one starts. */
export interface HistoryPage {
	items: HistoryItem[];
	/** Pass as `after` for the next page, or `null` on the last page. */
	next: string | null;
}

/**
 * Lists the episodes a user played or marked watched, the most recent
 * first, one item per episode.
 *
 * An episode the user played part of is listed at when they last played
 * it, and moves up each time they play it. Once they finish it, it is
 * listed at when they first finished it, and stays there: playing it again
 * neither lists it again nor moves it up. An episode marked watched (see
 * `markSeason`) is listed at when it was marked. An episode its season no
 * longer lists is left out.
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
	const entries = unionAll(
		db
			.select({
				seasonId: watchedEpisode.seasonId,
				episode: watchedEpisode.episode,
				watched: sql<boolean>`true`.as("watched"),
				at: sql<Date>`${watchedEpisode.finishedAt}`.mapWith(watchedEpisode.finishedAt).as("at"),
			})
			.from(watchedEpisode)
			.where(eq(watchedEpisode.userId, userId)),
		db
			.select({
				seasonId: episodeProgress.seasonId,
				episode: episodeProgress.episode,
				watched: sql<boolean>`false`.as("watched"),
				// The cursor carries milliseconds, as `finished_at` does.
				at: sql<Date>`date_trunc('milliseconds', ${episodeProgress.watchedAt})`
					.mapWith(watchedEpisode.finishedAt)
					.as("at"),
			})
			.from(episodeProgress)
			.where(
				and(
					eq(episodeProgress.userId, userId),
					sql`not exists (
						select 1 from ${watchedEpisode}
						where ${watchedEpisode.userId} = ${episodeProgress.userId}
							and ${watchedEpisode.seasonId} = ${episodeProgress.seasonId}
							and ${watchedEpisode.episode} = ${episodeProgress.episode}
					)`,
				),
			),
	).as("entries");

	const rows = await db
		.select({
			entry: {
				seasonId: entries.seasonId,
				episode: entries.episode,
				watched: entries.watched,
				at: entries.at,
			},
			series,
			seasonTitle: seriesSeason.title,
			seasonKind: seriesSeason.kind,
			episodeTitle: seriesEpisode.title,
			episodeStillUrl: effectiveStill,
			positionSeconds: episodeProgress.positionSeconds,
			durationSeconds: episodeProgress.durationSeconds,
		})
		.from(entries)
		.innerJoin(
			seriesEpisode,
			and(eq(seriesEpisode.seasonId, entries.seasonId), eq(seriesEpisode.number, entries.episode)),
		)
		.innerJoin(seriesSeason, eq(seriesSeason.id, entries.seasonId))
		.innerJoin(series, eq(series.id, seriesSeason.seriesId))
		.leftJoin(
			episodeProgress,
			and(
				eq(episodeProgress.userId, userId),
				eq(episodeProgress.seasonId, entries.seasonId),
				eq(episodeProgress.episode, entries.episode),
			),
		)
		.where(options.after ? after(entries, options.after) : undefined)
		.orderBy(desc(entries.at), desc(entries.seasonId), desc(entries.episode))
		.limit(limit + 1);

	const page = rows.slice(0, limit);
	const cards = await toSeriesCards([
		...new Map(page.map((row) => [row.series.id, row.series])).values(),
	]);
	const last = page.at(-1)?.entry;

	return {
		items: page.flatMap((row): HistoryItem[] => {
			const card = cards.get(row.series.id);
			return card
				? [
						{
							series: card,
							seasonId: row.entry.seasonId,
							seasonTitle: row.seasonTitle,
							seasonKind: row.seasonKind,
							episode: row.entry.episode,
							episodeTitle: row.episodeTitle,
							episodeStillUrl: row.episodeStillUrl,
							watched: row.entry.watched,
							positionSeconds: row.positionSeconds,
							durationSeconds: row.durationSeconds,
							listedAt: row.entry.at.toISOString(),
						},
					]
				: [];
		}),
		next:
			rows.length > limit && last
				? [last.at.toISOString(), last.seasonId, last.episode].join("_")
				: null,
	};
}

/** The episodes after a page's last one, in the order {@link getHistory} lists them. */
function after(
	entries: {
		seasonId: Column;
		episode: Column;
		at: SQL.Aliased<Date>;
	},
	cursor: string,
): SQL | undefined {
	const [at, seasonId, number] = cursor.split("_");
	const listedAt = new Date(at ?? "");
	const episode = Number(number);
	if (Number.isNaN(listedAt.getTime()) || !seasonId || !Number.isInteger(episode)) {
		throw new InvalidInputError("Invalid history cursor");
	}

	return or(
		lt(entries.at, listedAt),
		and(eq(entries.at, listedAt), lt(entries.seasonId, seasonId)),
		and(eq(entries.at, listedAt), eq(entries.seasonId, seasonId), lt(entries.episode, episode)),
	);
}
