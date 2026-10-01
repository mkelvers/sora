import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import { episodeProgress, series, seriesEpisode, seriesSeason } from "../../database/schema";
import { EpisodeNotFoundError, InvalidInputError } from "../../errors";
import type { SeriesCard } from "../../series/models";
import {
	assertSeriesExists,
	getAdjacentEpisodes,
	toSeriesCards,
	type EpisodeAddress,
} from "../../series/queries";
import type { SeasonKind } from "../../series/seasons";

/** How far a user is into one episode. */
export interface Progress {
	seasonId: string;
	/** Position within the season, from 1. */
	episode: number;
	/** Where the user stopped, in seconds from the start. */
	positionSeconds: number;
	/** How long the episode runs, in seconds. */
	durationSeconds: number;
	/**
	 * Whether the user stopped where the episode is over, as the player they
	 * watched it in judged: it played to the end, or only its credits were
	 * left. Stopping earlier in the episode later makes it unfinished again.
	 */
	finished: boolean;
	/** When the user last played it, as an ISO 8601 timestamp. */
	watchedAt: string;
}

/** The episode of a show a user plays next. */
export interface NextEpisode {
	seasonId: string;
	/** The season's title, such as "Season 2"; see `Season.title`. */
	seasonTitle: string;
	seasonKind: SeasonKind;
	/** Position within the season, from 1. */
	episode: number;
	/** Where to resume the episode, in seconds; 0 for one not started. */
	positionSeconds: number;
	/** How long the episode runs, in seconds; `null` for one not started. */
	durationSeconds: number | null;
}

/** A show a user is in the middle of, with the episode to play next. */
export interface ContinueWatching extends NextEpisode {
	series: SeriesCard;
}

/** A user's progress through one show. */
export interface SeriesProgress {
	/** The progress in every episode of the show the user played, the most recently played first. */
	episodes: Progress[];
	/**
	 * The episode to play next, or `null` when the user played none of the
	 * show, or finished the last episode that is out.
	 */
	next: NextEpisode | null;
}

/** Where a user stopped in an episode. Validate untrusted input with this schema. */
export const ProgressInputSchema = z.object({
	positionSeconds: z.number().int().nonnegative(),
	durationSeconds: z.number().int().positive(),
	finished: z.boolean(),
});

export type ProgressInput = z.input<typeof ProgressInputSchema>;

/** The shows {@link getContinueWatching} looks at, the most recently played. */
const recentShows = 30;

/**
 * Remembers where a user stopped in an episode, replacing what was
 * remembered before, and returns the progress as it now stands.
 *
 * @throws {@link InvalidInputError} when the input fails {@link ProgressInputSchema}.
 * @throws {@link EpisodeNotFoundError} when the season has no such episode
 *   that can be played.
 */
export async function saveProgress(
	userId: string,
	address: EpisodeAddress,
	input: ProgressInput,
): Promise<Progress> {
	const parsed = ProgressInputSchema.safeParse(input);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid progress", {
			cause: parsed.error,
		});
	}

	const [playable] = await db
		.select({
			number: seriesEpisode.number,
		})
		.from(seriesEpisode)
		.where(
			and(
				eq(seriesEpisode.seasonId, address.seasonId),
				eq(seriesEpisode.number, address.episode),
				isNotNull(seriesEpisode.anilistId),
			),
		)
		.limit(1);
	if (!playable) {
		throw new EpisodeNotFoundError(address.seasonId, address.episode);
	}

	const values = {
		positionSeconds: Math.min(parsed.data.positionSeconds, parsed.data.durationSeconds),
		durationSeconds: parsed.data.durationSeconds,
		finished: parsed.data.finished,
	};
	const [row] = await db
		.insert(episodeProgress)
		.values({
			userId,
			seasonId: address.seasonId,
			episode: address.episode,
			...values,
		})
		.onConflictDoUpdate({
			target: [episodeProgress.userId, episodeProgress.seasonId, episodeProgress.episode],
			set: {
				...values,
				watchedAt: sql`now()`,
			},
		})
		.returning();

	return toProgress(row!);
}

/** A user's progress in an episode, or `null` when they never played it. */
export async function getProgress(
	userId: string,
	address: EpisodeAddress,
): Promise<Progress | null> {
	const [row] = await db
		.select()
		.from(episodeProgress)
		.where(
			and(
				eq(episodeProgress.userId, userId),
				eq(episodeProgress.seasonId, address.seasonId),
				eq(episodeProgress.episode, address.episode),
			),
		)
		.limit(1);

	return row ? toProgress(row) : null;
}

/**
 * A user's progress through a show: every episode of it they played, and
 * the episode to play next, as {@link getContinueWatching} picks it.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function getSeriesProgress(userId: string, seriesId: string): Promise<SeriesProgress> {
	await assertSeriesExists(seriesId);
	const rows = await db
		.select({
			progress: episodeProgress,
		})
		.from(episodeProgress)
		.innerJoin(seriesSeason, eq(seriesSeason.id, episodeProgress.seasonId))
		.where(and(eq(episodeProgress.userId, userId), eq(seriesSeason.seriesId, seriesId)))
		.orderBy(desc(episodeProgress.watchedAt));

	const [last] = rows;
	const next = last
		? await nextEpisodes(userId, [
				{
					seriesId,
					...last.progress,
				},
			])
		: null;

	return {
		episodes: rows.map((row) => toProgress(row.progress)),
		next: next?.get(seriesId) ?? null,
	};
}

/**
 * The shows a user is in the middle of, the most recently played first,
 * each with the episode to play next.
 *
 * A show is judged by the episode the user played last. While that episode
 * is unfinished, it is the one to play. Once it is finished, the episode
 * after it is (see `getAdjacentEpisodes`), from where the user left it if
 * they started it before; a show with no episode after it is left out until
 * one comes out.
 *
 * Only the {@link recentShows} most recently played shows are looked at.
 */
export async function getContinueWatching(userId: string): Promise<ContinueWatching[]> {
	const latest = db
		.selectDistinctOn([seriesSeason.seriesId], {
			seriesId: seriesSeason.seriesId,
			seasonId: episodeProgress.seasonId,
			episode: episodeProgress.episode,
			finished: episodeProgress.finished,
			watchedAt: episodeProgress.watchedAt,
		})
		.from(episodeProgress)
		.innerJoin(seriesSeason, eq(seriesSeason.id, episodeProgress.seasonId))
		.where(eq(episodeProgress.userId, userId))
		.orderBy(seriesSeason.seriesId, desc(episodeProgress.watchedAt))
		.as("latest");
	const played = await db.select().from(latest).orderBy(desc(latest.watchedAt)).limit(recentShows);

	const next = await nextEpisodes(userId, played);
	if (next.size === 0) {
		return [];
	}

	const cards = await toSeriesCards(
		await db
			.select()
			.from(series)
			.where(inArray(series.id, [...next.keys()])),
	);

	return played.flatMap(({ seriesId }) => {
		const card = cards.get(seriesId);
		const episode = next.get(seriesId);
		return card && episode
			? [
					{
						series: card,
						...episode,
					},
				]
			: [];
	});
}

/**
 * Forgets a user's progress in every episode of a show, so the show is no
 * longer one they are in the middle of.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function removeProgress(userId: string, seriesId: string) {
	await assertSeriesExists(seriesId);
	await db.delete(episodeProgress).where(
		and(
			eq(episodeProgress.userId, userId),
			inArray(
				episodeProgress.seasonId,
				db
					.select({
						id: seriesSeason.id,
					})
					.from(seriesSeason)
					.where(eq(seriesSeason.seriesId, seriesId)),
			),
		),
	);
}

/**
 * The episode to play next in each show, keyed by series ID, given the
 * episode the user played last in it: that episode while it is unfinished,
 * else the one after it, with the progress the user has in that one. A show
 * with no episode after a finished one is left out.
 */
async function nextEpisodes(
	userId: string,
	played: readonly (EpisodeAddress & {
		seriesId: string;
		finished: boolean;
	})[],
): Promise<Map<string, NextEpisode>> {
	const found = (
		await Promise.all(
			played.map(async (last) => ({
				seriesId: last.seriesId,
				next: last.finished
					? (await getAdjacentEpisodes(last.seriesId, last.seasonId, last.episode)).next
					: last,
			})),
		)
	).flatMap(({ seriesId, next }) =>
		next
			? [
					{
						seriesId,
						seasonId: next.seasonId,
						episode: next.episode,
					},
				]
			: [],
	);
	if (found.length === 0) {
		return new Map();
	}

	const [started, seasons] = await Promise.all([
		db
			.select()
			.from(episodeProgress)
			.where(
				and(
					eq(episodeProgress.userId, userId),
					eq(episodeProgress.finished, false),
					or(
						...found.map((next) =>
							and(
								eq(episodeProgress.seasonId, next.seasonId),
								eq(episodeProgress.episode, next.episode),
							),
						),
					),
				),
			),
		db
			.select({
				id: seriesSeason.id,
				title: seriesSeason.title,
				kind: seriesSeason.kind,
			})
			.from(seriesSeason)
			.where(
				inArray(
					seriesSeason.id,
					found.map((next) => next.seasonId),
				),
			),
	]);

	return new Map(
		found.flatMap(({ seriesId, seasonId, episode }) => {
			const season = seasons.find((candidate) => candidate.id === seasonId);
			const unfinished = started.find(
				(row) => row.seasonId === seasonId && row.episode === episode,
			);
			return season
				? [
						[
							seriesId,
							{
								seasonId,
								seasonTitle: season.title,
								seasonKind: season.kind,
								episode,
								positionSeconds: unfinished?.positionSeconds ?? 0,
								durationSeconds: unfinished?.durationSeconds ?? null,
							},
						] as const,
					]
				: [];
		}),
	);
}

function toProgress(row: typeof episodeProgress.$inferSelect): Progress {
	return {
		seasonId: row.seasonId,
		episode: row.episode,
		positionSeconds: row.positionSeconds,
		durationSeconds: row.durationSeconds,
		finished: row.finished,
		watchedAt: row.watchedAt.toISOString(),
	};
}
