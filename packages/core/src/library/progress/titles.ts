import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "../../database/client";
import {
	anime,
	playbackProgress,
	series,
	seriesEpisode,
	seriesSeason,
} from "../../database/schema";
import { isEpisodeAvailable, isEpisodeShown, loadAniKotoEpisodes } from "../../series/episodes";
import type { EpisodeProgress, TitleEpisode } from "./resume";

/** Everything the resume rules need about some titles. */
export interface LoadedTitles {
	/** The stored titles, by ID. */
	series: Map<string, typeof series.$inferSelect>;
	/** Every episode of a title in title order; see {@link loadTitleEpisodes}. */
	episodes: (seriesId: string) => TitleEpisode[];
	/** Season titles, such as "Season 2", by season ID. */
	seasonTitles: Map<string, string>;
}

/**
 * Loads the given titles with every episode they list, in title order. Only
 * the episodes seasons list count (see {@link isEpisodeShown}); each is
 * released once AniKoto carries it (see {@link isEpisodeAvailable}).
 */
export async function loadTitles(seriesIds: readonly string[]): Promise<LoadedTitles> {
	if (seriesIds.length === 0) {
		return {
			series: new Map(),
			episodes: () => [],
			seasonTitles: new Map(),
		};
	}

	const [stored, rows] = await Promise.all([
		db
			.select()
			.from(series)
			.where(inArray(series.id, [...seriesIds])),
		db
			.select({
				seriesId: seriesSeason.seriesId,
				seasonId: seriesSeason.id,
				seasonKind: seriesSeason.kind,
				seasonTitle: seriesSeason.title,
				inWatchOrder: seriesSeason.inWatchOrder,
				number: seriesEpisode.number,
				anilistId: seriesEpisode.anilistId,
				anilistEpisode: seriesEpisode.anilistEpisode,
				airDate: seriesEpisode.airDate,
				airedAt: seriesEpisode.airedAt,
				tmdbEpisodeNumber: seriesEpisode.tmdbEpisodeNumber,
				entryStatus: anime.status,
			})
			.from(seriesEpisode)
			.innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
			.leftJoin(anime, eq(anime.anilistId, seriesEpisode.anilistId))
			.where(inArray(seriesSeason.seriesId, [...seriesIds]))
			.orderBy(asc(seriesSeason.seriesId), asc(seriesSeason.position), asc(seriesEpisode.number)),
	]);
	const onAniKoto = await loadAniKotoEpisodes(rows.flatMap((row) => row.anilistId ?? []));
	const seriesById = new Map(stored.map((row) => [row.id, row]));
	const now = new Date();

	const bySeries = new Map<string, TitleEpisode[]>();
	for (const title of stored) {
		const shown = rows.filter(
			(row) =>
				row.seriesId === title.id &&
				isEpisodeShown(
					title,
					{
						kind: row.seasonKind,
					},
					row,
					onAniKoto,
					now,
				),
		);

		const lastPlayable = new Map<string, number>();
		for (const row of shown) {
			if (row.anilistId !== null) {
				lastPlayable.set(row.seasonId, row.number);
			}
		}

		bySeries.set(
			title.id,
			shown.map((row) => {
				const isLast = row.anilistId !== null && lastPlayable.get(row.seasonId) === row.number;
				return {
					seasonId: row.seasonId,
					inWatchOrder: row.inWatchOrder,
					number: row.number,
					isExtra: row.anilistId === null,
					isReleased: isEpisodeAvailable(title, row, onAniKoto, now),
					releasedAt:
						row.airedAt?.toISOString() ?? (row.airDate ? `${row.airDate}T00:00:00.000Z` : null),
					isFinale: isLast && hasFinished(title, row.seasonId, row.entryStatus),
				};
			}),
		);
	}

	return {
		series: seriesById,
		episodes: (seriesId) => bySeries.get(seriesId) ?? [],
		seasonTitles: new Map(rows.map((row) => [row.seasonId, row.seasonTitle])),
	};
}

/**
 * A user's checkpoints for the given titles, or for every title they played,
 * most recent first per title. Titles come in order of their latest event.
 */
export async function loadCheckpoints(
	userId: string,
	seriesIds?: readonly string[],
): Promise<Map<string, EpisodeProgress[]>> {
	if (seriesIds?.length === 0) {
		return new Map();
	}

	const rows = await db
		.select({
			progress: playbackProgress,
			seriesId: seriesSeason.seriesId,
			seasonId: seriesEpisode.seasonId,
			number: seriesEpisode.number,
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
		.where(
			and(
				eq(playbackProgress.userId, userId),
				seriesIds ? inArray(seriesSeason.seriesId, [...seriesIds]) : undefined,
			),
		)
		.orderBy(
			desc(playbackProgress.eventAt),
			desc(seriesSeason.position),
			desc(seriesEpisode.number),
		);

	const bySeries = new Map<string, EpisodeProgress[]>();
	for (const row of rows) {
		const checkpoint = toEpisodeProgress(row.progress, row.seasonId, row.number);
		const known = bySeries.get(row.seriesId);
		if (known) {
			known.push(checkpoint);
		} else {
			bySeries.set(row.seriesId, [checkpoint]);
		}
	}

	return bySeries;
}

/** Builds a season checkpoint from a stored row and where its episode sits. */
export function toEpisodeProgress(
	row: typeof playbackProgress.$inferSelect,
	seasonId: string,
	episode: number,
): EpisodeProgress {
	return {
		seasonId,
		episode,
		positionSeconds: row.positionSeconds,
		durationSeconds: row.durationSeconds,
		watched: row.watched,
		eventAt: row.eventAt.toISOString(),
	};
}

/**
 * Whether a season has finished airing: its AniList entry has, or, for a
 * season without a stored entry, the title has or airs another season next.
 */
function hasFinished(
	title: typeof series.$inferSelect,
	seasonId: string,
	entryStatus: string | null,
) {
	return entryStatus
		? entryStatus === "FINISHED" || entryStatus === "CANCELLED"
		: title.status === "FINISHED" || title.nextEpisodeSeasonId !== seasonId;
}
