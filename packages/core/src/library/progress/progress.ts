import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { catalogSeriesAllowed } from "../../catalog/visibility";
import { db } from "../../database/client";
import { episodeProgress, series, seriesState } from "../../database/schema";
import { InvalidInputError } from "../../errors";
import { ProgressInputSchema } from "../../models/library";
import type {
	ContinueWatching,
	NextEpisode,
	Progress,
	ProgressInput,
	SeriesProgress,
} from "../../models/library";
import { locateEpisode } from "../../series/episodes";
import {
	assertSeriesExists,
	getAdjacentEpisodes,
	getSeriesEpisodes,
	toSeriesCards,
} from "../../series/queries";
import { clearSeriesState } from "../state";
import { updateWatchlistAfterPlayback } from "../watchlist/watchlist";

/** An episode, by its series and its number in it. */
export interface EpisodeAddress {
	seriesId: string;
	/** The episode's number in the series, from 1. */
	episode: number;
}

/** The series {@link getContinueWatching} looks at, the most recently played. */
const recentSeries = 30;

const progressKey = [
	episodeProgress.userId,
	episodeProgress.seriesId,
	episodeProgress.episode,
	episodeProgress.rewatch,
];

/** Whether a user is rewatching a series; see {@link startRewatch}. */
const isRewatching = async (userId: string, seriesId: string): Promise<boolean> => {
	const [state] = await db
		.select({
			rewatchStartedAt: seriesState.rewatchStartedAt,
		})
		.from(seriesState)
		.where(and(eq(seriesState.userId, userId), eq(seriesState.seriesId, seriesId)))
		.limit(1);

	return !!state?.rewatchStartedAt;
};

const toProgress = (row: typeof episodeProgress.$inferSelect): Progress => ({
	duration_seconds: row.durationSeconds,
	episode: row.episode,
	finished: row.finished,
	position_seconds: row.positionSeconds,
	series_id: row.seriesId,
	watched_at: row.watchedAt.toISOString(),
});

/**
 * A user's progress in an episode, in the rewatch they are in the middle
 * of, if any, else in their first viewing; `null` when they did not play it
 * there.
 */
export const getProgress = async (
	userId: string,
	address: EpisodeAddress,
): Promise<Progress | null> => {
	const [row] = await db
		.select()
		.from(episodeProgress)
		.where(
			and(
				eq(episodeProgress.userId, userId),
				eq(episodeProgress.seriesId, address.seriesId),
				eq(episodeProgress.episode, address.episode),
				eq(episodeProgress.rewatch, await isRewatching(userId, address.seriesId)),
			),
		)
		.limit(1);

	return row ? toProgress(row) : null;
};

const deleteRewatchProgress = async (userId: string, seriesId: string) => {
	await db
		.delete(episodeProgress)
		.where(
			and(
				eq(episodeProgress.userId, userId),
				eq(episodeProgress.seriesId, seriesId),
				eq(episodeProgress.rewatch, true),
			),
		);
};

/**
 * Ends a user's rewatch of a series, forgetting its progress, so the
 * series is back as their first viewing left it.
 */
const endRewatch = async (userId: string, seriesId: string) => {
	await deleteRewatchProgress(userId, seriesId);
	await clearSeriesState(userId, seriesId, {
		rewatch: true,
	});
};

/**
 * Moves the series' watchlist status on after an episode was played or
 * marked, and ends a rewatch once its last episode is finished.
 */
const afterPlayback = async (userId: string, address: EpisodeAddress, finished: boolean) => {
	await updateWatchlistAfterPlayback(userId, address.seriesId, {
		episode: address.episode,
		finished,
	});
	if (finished) {
		const adjacent = await getAdjacentEpisodes(address.seriesId, address.episode);

		if (adjacent.next === null) {
			await endRewatch(userId, address.seriesId);
		}
	}
};

/**
 * Remembers where a user stopped in an episode, replacing what was
 * remembered before, and returns the progress as it now stands: `null`
 * when the user never got past the start of an episode they had not played,
 * since stopping at the very start is not remembered, and an episode
 * already finished stays as it was unless the user finishes it again.
 * During a rewatch this is the rewatch's progress, and the first viewing is
 * left as it was.
 * The series' watchlist status moves on as `updateWatchlistAfterPlayback`
 * says, and finishing its last episode ends a rewatch of it.
 *
 * @throws {@link InvalidInputError} when the input fails {@link ProgressInputSchema}.
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 * @throws {@link EpisodeNotFoundError} when the series has no such episode.
 */
export const saveProgress = async (
	userId: string,
	address: EpisodeAddress,
	input: ProgressInput,
): Promise<Progress | null> => {
	const parsed = ProgressInputSchema.safeParse(input);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid progress", {
			cause: parsed.error,
		});
	}

	await locateEpisode(address.seriesId, address.episode);

	// Opening an episode and leaving before it plays is not watching it.
	if (parsed.data.position_seconds === 0 && !parsed.data.finished) {
		return getProgress(userId, address);
	}

	const values = {
		durationSeconds: parsed.data.duration_seconds,
		finished: parsed.data.finished,
		positionSeconds: Math.min(parsed.data.position_seconds, parsed.data.duration_seconds),
	};
	const [row] = await db
		.insert(episodeProgress)
		.values({
			userId,
			...address,
			...values,
			rewatch: await isRewatching(userId, address.seriesId),
		})
		.onConflictDoUpdate({
			set: {
				...values,
				watchedAt: sql`now()`,
			},
			setWhere: sql`not ${episodeProgress.finished} or excluded.finished`,
			target: progressKey,
		})
		.returning();
	if (!row) {
		return getProgress(userId, address);
	}

	await afterPlayback(userId, address, values.finished);

	return toProgress(row);
};

/**
 * Marks an episode of a series watched without playing it, or every episode
 * the series lists when `episode` is omitted, as if each had been played to
 * its end just now. The series' watchlist status and any rewatch of it move
 * on as {@link saveProgress} says.
 *
 * Marking the whole series during a rewatch ends the rewatch instead: its
 * progress is forgotten, and episodes are marked only where the first
 * viewing left them unfinished, so the episodes finished then keep when
 * they were.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 * @throws {@link EpisodeNotFoundError} when the series has no such episode.
 */
export const markWatched = async (userId: string, seriesId: string, episode?: number) => {
	const listed = await getSeriesEpisodes(seriesId);
	if (episode !== undefined) {
		await locateEpisode(seriesId, episode);
	}

	const marked = listed.filter(
		(candidate) => episode === undefined || candidate.number === episode,
	);
	const last = marked.at(-1);
	if (!last) {
		return;
	}

	const rewatching = await isRewatching(userId, seriesId);
	const ending = rewatching && episode === undefined;
	const rewatch = rewatching && !ending;
	const playedRows = await db
		.select({
			durationSeconds: episodeProgress.durationSeconds,
			episode: episodeProgress.episode,
		})
		.from(episodeProgress)
		.where(
			and(
				eq(episodeProgress.userId, userId),
				eq(episodeProgress.seriesId, seriesId),
				eq(episodeProgress.rewatch, rewatch),
			),
		);
	const played = new Map(playedRows.map((row) => [row.episode, row.durationSeconds]));
	await db
		.insert(episodeProgress)
		.values(
			marked.map((candidate) => {
				const durationSeconds =
					played.get(candidate.number) ?? (candidate.runtime_minutes ?? 0) * 60;
				return {
					durationSeconds,
					episode: candidate.number,
					finished: true,
					positionSeconds: durationSeconds,
					rewatch,
					seriesId,
					userId,
				};
			}),
		)
		.onConflictDoUpdate({
			set: {
				durationSeconds: sql`excluded.duration_seconds`,
				finished: true,
				positionSeconds: sql`excluded.duration_seconds`,
				watchedAt: sql`now()`,
			},
			target: progressKey,
			...(ending && {
				setWhere: eq(episodeProgress.finished, false),
			}),
		});
	if (ending) {
		await endRewatch(userId, seriesId);
	}

	await afterPlayback(
		userId,
		{
			episode: last.number,
			seriesId,
		},
		true,
	);
};

/**
 * Forgets a user's progress in one episode of a series, so it is no longer
 * watched or started: in the rewatch they are in the middle of, if any,
 * else in their first viewing. {@link removeProgress} forgets every episode.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 * @throws {@link EpisodeNotFoundError} when the series has no such episode.
 */
export const markUnwatched = async (userId: string, address: EpisodeAddress) => {
	await locateEpisode(address.seriesId, address.episode);
	await db
		.delete(episodeProgress)
		.where(
			and(
				eq(episodeProgress.userId, userId),
				eq(episodeProgress.seriesId, address.seriesId),
				eq(episodeProgress.episode, address.episode),
				eq(episodeProgress.rewatch, await isRewatching(userId, address.seriesId)),
			),
		);
};

/**
 * The episode to play next in each series, keyed by series ID, given the
 * episode the user played last in it: that episode while it is unfinished,
 * else the one after it, with the progress the user has in that one in the
 * same viewing. A series with no episode after a finished one is left out.
 */
const nextEpisodes = async (
	userId: string,
	played: readonly (EpisodeAddress & {
		finished: boolean;
		rewatch: boolean;
	})[],
): Promise<Map<string, NextEpisode>> => {
	const candidates = await Promise.all(
		played.map(async (last) => {
			if (!last.finished) {
				return {
					episode: last.episode,
					rewatch: last.rewatch,
					seriesId: last.seriesId,
				};
			}

			const adjacent = await getAdjacentEpisodes(last.seriesId, last.episode);

			return {
				episode: adjacent.next,
				rewatch: last.rewatch,
				seriesId: last.seriesId,
			};
		}),
	);
	const found = candidates.flatMap(({ seriesId, rewatch, episode }) =>
		episode === null
			? []
			: [
					{
						episode,
						rewatch,
						seriesId,
					},
				],
	);
	if (found.length === 0) {
		return new Map();
	}

	const started = await db
		.select()
		.from(episodeProgress)
		.where(
			and(
				eq(episodeProgress.userId, userId),
				eq(episodeProgress.finished, false),
				or(
					...found.map((next) =>
						and(
							eq(episodeProgress.seriesId, next.seriesId),
							eq(episodeProgress.episode, next.episode),
							eq(episodeProgress.rewatch, next.rewatch),
						),
					),
				),
			),
		);

	return new Map(
		found.map(({ seriesId, rewatch, episode }) => {
			const unfinished = started.find(
				(row) => row.seriesId === seriesId && row.episode === episode && row.rewatch === rewatch,
			);
			return [
				seriesId,
				{
					duration_seconds: unfinished?.durationSeconds ?? null,
					episode,
					position_seconds: unfinished?.positionSeconds ?? 0,
				},
			];
		}),
	);
};

/**
 * A user's progress through a series: every episode of it they played, and
 * the episode to play next, as {@link getContinueWatching} picks it: none
 * once every episode it lists is finished, unless they are rewatching it.
 * During a rewatch both follow only what the user played since starting it.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export const getSeriesProgress = async (
	userId: string,
	seriesId: string,
): Promise<SeriesProgress> => {
	await assertSeriesExists(seriesId);
	const [state] = await db
		.select({
			rewatchStartedAt: seriesState.rewatchStartedAt,
		})
		.from(seriesState)
		.where(and(eq(seriesState.userId, userId), eq(seriesState.seriesId, seriesId)))
		.limit(1);
	const startedAt = state?.rewatchStartedAt ?? null;
	const rewatch = startedAt !== null;
	const rows = await db
		.select()
		.from(episodeProgress)
		.where(
			and(
				eq(episodeProgress.userId, userId),
				eq(episodeProgress.seriesId, seriesId),
				eq(episodeProgress.rewatch, rewatch),
			),
		)
		.orderBy(desc(episodeProgress.watchedAt), desc(episodeProgress.episode));

	const [last] = rows;
	const finishedCount = rows.filter((row) => row.finished).length;
	const seriesEpisodes = await getSeriesEpisodes(seriesId);
	const finished = !rewatch && finishedCount > 0 && finishedCount >= seriesEpisodes.length;
	const next = last && !finished ? await nextEpisodes(userId, [last]) : null;

	return {
		episodes: rows.map(toProgress),
		finished,
		next:
			rewatch && !last
				? {
						duration_seconds: null,
						episode: 1,
						position_seconds: 0,
					}
				: (next?.get(seriesId) ?? null),
		rewatch_started_at: startedAt?.toISOString() ?? null,
	};
};

/**
 * Starts watching a series again from its first episode. Until the user
 * finishes its last episode again, or marks the series watched, what they
 * play is remembered apart from their first viewing, which stays as it was
 * (see {@link SeriesProgress.episodes}), and the episode to play next
 * follows it.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export const startRewatch = async (userId: string, seriesId: string) => {
	await assertSeriesExists(seriesId);
	await deleteRewatchProgress(userId, seriesId);
	await db
		.insert(seriesState)
		.values({
			rewatchStartedAt: sql`now()`,
			seriesId,
			userId,
		})
		.onConflictDoUpdate({
			set: {
				rewatchStartedAt: sql`now()`,
			},
			target: [seriesState.userId, seriesState.seriesId],
		});
};

/**
 * The series a user is in the middle of, the most recently played first,
 * each with the episode to play next.
 *
 * A series is judged by the episode the user played last, the later one
 * when several were played at once, as marking a season watched does. While that
 * episode is unfinished, it is the one to play. Once it is finished, the
 * episode after it is (see `getAdjacentEpisodes`), from where the user left
 * it if they started it before; a series with no episode after it is left
 * out until one comes out, and so is a series whose every listed episode is
 * finished, unless the user is rewatching it. A series being rewatched is
 * judged by what the user played since starting the rewatch, and left out
 * until they play some of it. Finishing a series never leads on into
 * another, such as its next season.
 *
 * A series whose card the user took out (see {@link dismissContinueWatching})
 * is left out until they play or mark an episode of it again. Only the
 * {@link recentSeries} most recently played series are looked at.
 */
export const getContinueWatching = async (userId: string): Promise<ContinueWatching[]> => {
	const latest = db
		.selectDistinctOn([episodeProgress.seriesId], {
			dismissedAt: seriesState.dismissedAt,
			episode: episodeProgress.episode,
			finished: episodeProgress.finished,
			rewatch: episodeProgress.rewatch,
			seriesId: episodeProgress.seriesId,
			watchedAt: episodeProgress.watchedAt,
		})
		.from(episodeProgress)
		.leftJoin(
			seriesState,
			and(
				eq(seriesState.userId, episodeProgress.userId),
				eq(seriesState.seriesId, episodeProgress.seriesId),
			),
		)
		.where(
			and(
				eq(episodeProgress.userId, userId),
				eq(episodeProgress.rewatch, sql`(${seriesState.rewatchStartedAt} is not null)`),
			),
		)
		.orderBy(
			episodeProgress.seriesId,
			desc(episodeProgress.watchedAt),
			desc(episodeProgress.episode),
		)
		.as("latest");
	const played = await db
		.select({
			episode: latest.episode,
			finished: latest.finished,
			rewatch: latest.rewatch,
			seriesId: latest.seriesId,
		})
		.from(latest)
		.innerJoin(series, eq(series.id, latest.seriesId))
		.where(
			and(
				catalogSeriesAllowed,
				or(isNull(latest.dismissedAt), lt(latest.dismissedAt, latest.watchedAt)),
			),
		)
		.orderBy(desc(latest.watchedAt))
		.limit(recentSeries);

	const next = await nextEpisodes(userId, played);
	if (next.size === 0) {
		return [];
	}

	const [cards, finishedCounts] = await Promise.all([
		toSeriesCards(
			await db
				.select()
				.from(series)
				.where(inArray(series.id, [...next.keys()])),
		),
		db
			.select({
				finished: sql<number>`count(*)::int`,
				seriesId: episodeProgress.seriesId,
			})
			.from(episodeProgress)
			.where(
				and(
					eq(episodeProgress.userId, userId),
					eq(episodeProgress.finished, true),
					eq(episodeProgress.rewatch, false),
					inArray(episodeProgress.seriesId, [...next.keys()]),
				),
			)
			.groupBy(episodeProgress.seriesId),
	]);
	const finished = new Map(finishedCounts.map((row) => [row.seriesId, row.finished]));

	return played.flatMap(({ seriesId, rewatch }) => {
		const card = cards.get(seriesId);
		const episode = next.get(seriesId);
		const complete = !rewatch && (finished.get(seriesId) ?? 0) >= (card?.episode_count ?? 0);
		return card && episode && !complete
			? [
					{
						series: card,
						...episode,
					},
				]
			: [];
	});
};

/**
 * Takes a series' card out of {@link getContinueWatching} without forgetting
 * the user's progress in it. Playing or marking an episode of it afterwards
 * brings the card back.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export const dismissContinueWatching = async (userId: string, seriesId: string) => {
	await assertSeriesExists(seriesId);
	await db
		.insert(seriesState)
		.values({
			dismissedAt: sql`now()`,
			seriesId,
			userId,
		})
		.onConflictDoUpdate({
			set: {
				dismissedAt: sql`now()`,
			},
			target: [seriesState.userId, seriesState.seriesId],
		});
};

/**
 * Forgets a user's progress in every episode of a series, in their first
 * viewing and any rewatch of it, so the series is no longer one they are in
 * the middle of.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export const removeProgress = async (userId: string, seriesId: string) => {
	await assertSeriesExists(seriesId);
	await db
		.delete(episodeProgress)
		.where(and(eq(episodeProgress.userId, userId), eq(episodeProgress.seriesId, seriesId)));
	await clearSeriesState(userId, seriesId, {
		dismissal: true,
		rewatch: true,
	});
};
