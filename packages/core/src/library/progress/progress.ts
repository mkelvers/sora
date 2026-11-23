import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { catalogSeriesAllowed } from "../../catalog/visibility";
import { db } from "../../database/client";
import { episodeProgress, seriesState } from "../../database/schema/library";
import { series } from "../../database/schema/series";
import { InvalidInputError } from "../../errors";
import { ProgressInputSchema } from "../../models/library";
import type {
	ContinueWatching,
	NextEpisode,
	Progress,
	ProgressInput,
	SeriesProgress,
} from "../../models/library";
import { locate } from "../../series/episodes";
import { toCards, titles } from "../../series/queries";
import { clearSeries } from "../state";
import { Played } from "./played";
import { Viewer } from "./viewer";

/** An episode, by its series and its number in it. */
export interface EpisodeAddress {
	seriesId: string;
	/** The episode's number in the series, from 1. */
	episode: number;
}

const uniqueKey = [
	episodeProgress.userId,
	episodeProgress.seriesId,
	episodeProgress.episode,
	episodeProgress.rewatch,
];

export const progress = {
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
	 * A series whose card the user took out (see {@link progress.dismiss})
	 * is left out until they play or mark an episode of it again. Only the
	 * {@link recentSeries} most recently played series are looked at.
	 */
	async continueWatching(userId: string): Promise<ContinueWatching[]> {
		const viewer = new Viewer(userId);

		/** The series {@link progress.continueWatching} looks at, the most recently played. */
		const recentSeries = 30;

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

		const next = await viewer.next(played);

		if (next.size === 0) {
			return [];
		}

		const [cards, finishedCounts] = await Promise.all([
			toCards(
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

			const isShown = card && episode && !complete;

			if (!isShown) {
				return [];
			}

			return [
				{
					series: card,
					...episode,
				},
			];
		});
	},

	/**
	 * Takes a series' card out of {@link progress.continueWatching} without forgetting
	 * the user's progress in it. Playing or marking an episode of it afterwards
	 * brings the card back.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 */
	async dismiss(userId: string, seriesId: string) {
		await titles.assertExists(seriesId);
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
	},

	/**
	 * A user's progress in an episode, in the rewatch they are in the middle
	 * of, if any, else in their first viewing; `null` when they did not play it
	 * there.
	 */
	async get(userId: string, address: EpisodeAddress): Promise<Progress | null> {
		const viewer = new Viewer(userId);

		const [row] = await db
			.select()
			.from(episodeProgress)
			.where(
				and(
					eq(episodeProgress.userId, userId),
					eq(episodeProgress.seriesId, address.seriesId),
					eq(episodeProgress.episode, address.episode),
					eq(episodeProgress.rewatch, await viewer.rewatching(address.seriesId)),
				),
			)
			.limit(1);

		if (row) {
			return new Played(row).progress;
		}

		return null;
	},

	/**
	 * Forgets a user's progress in one episode of a series, so it is no longer
	 * watched or started: in the rewatch they are in the middle of, if any,
	 * else in their first viewing. {@link progress.remove} forgets every episode.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 * @throws {UnknownEpisodeError} when the series has no such episode.
	 */
	async markUnwatched(userId: string, address: EpisodeAddress) {
		const viewer = new Viewer(userId);

		await locate(address.seriesId, address.episode);
		await db
			.delete(episodeProgress)
			.where(
				and(
					eq(episodeProgress.userId, userId),
					eq(episodeProgress.seriesId, address.seriesId),
					eq(episodeProgress.episode, address.episode),
					eq(episodeProgress.rewatch, await viewer.rewatching(address.seriesId)),
				),
			);
	},

	/**
	 * Marks an episode of a series watched without playing it, or every episode
	 * the series lists when `episode` is omitted, as if each had been played to
	 * its end just now. The series' watchlist status and any rewatch of it move
	 * on as {@link progress.save} says.
	 *
	 * Marking the whole series during a rewatch ends the rewatch instead: its
	 * progress is forgotten, and episodes are marked only where the first
	 * viewing left them unfinished, so the episodes finished then keep when
	 * they were.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 * @throws {UnknownEpisodeError} when the series has no such episode.
	 */
	async markWatched(userId: string, seriesId: string, episode?: number) {
		const viewer = new Viewer(userId);

		const listed = await titles.episodes(seriesId);

		if (episode !== undefined) {
			await locate(seriesId, episode);
		}

		const marked = listed.filter(
			(candidate) => episode === undefined || candidate.number === episode,
		);

		const last = marked.at(-1);

		if (!last) {
			return;
		}

		const rewatching = await viewer.rewatching(seriesId);
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
				target: uniqueKey,
				...(ending && {
					setWhere: eq(episodeProgress.finished, false),
				}),
			});

		if (ending) {
			await viewer.endRewatch(seriesId);
		}

		await viewer.after(
			{
				episode: last.number,
				seriesId,
			},
			true,
		);
	},

	/**
	 * Forgets a user's progress in every episode of a series, in their first
	 * viewing and any rewatch of it, so the series is no longer one they are in
	 * the middle of.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 */
	async remove(userId: string, seriesId: string) {
		await titles.assertExists(seriesId);
		await db
			.delete(episodeProgress)
			.where(and(eq(episodeProgress.userId, userId), eq(episodeProgress.seriesId, seriesId)));
		await clearSeries(userId, seriesId, {
			dismissal: true,
			rewatch: true,
		});
	},

	/**
	 * Starts watching a series again from its first episode. Until the user
	 * finishes its last episode again, or marks the series watched, what they
	 * play is remembered apart from their first viewing, which stays as it was
	 * (see {@link SeriesProgress.episodes}), and the episode to play next
	 * follows it.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 */
	async rewatch(userId: string, seriesId: string) {
		const viewer = new Viewer(userId);

		await titles.assertExists(seriesId);
		await viewer.forgetRewatch(seriesId);
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
	},

	/**
	 * Remembers where a user stopped in an episode, replacing what was
	 * remembered before, and returns the progress as it now stands: `null`
	 * when the user never got past the start of an episode they had not played,
	 * since stopping at the very start is not remembered, and an episode
	 * already finished stays as it was unless the user finishes it again.
	 * During a rewatch this is the rewatch's progress, and the first viewing is
	 * left as it was.
	 * The series' watchlist status moves on as `followPlayback`
	 * says, and finishing its last episode ends a rewatch of it.
	 *
	 * @throws {InvalidInputError} when the input fails {@link ProgressInputSchema}.
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 * @throws {UnknownEpisodeError} when the series has no such episode.
	 */
	async save(
		userId: string,
		address: EpisodeAddress,
		input: ProgressInput,
	): Promise<Progress | null> {
		const viewer = new Viewer(userId);

		const parsed = ProgressInputSchema.safeParse(input);

		if (!parsed.success) {
			throw new InvalidInputError("Invalid progress", {
				cause: parsed.error,
			});
		}

		await locate(address.seriesId, address.episode);

		// Opening an episode and leaving before it plays is not watching it.
		if (parsed.data.position_seconds === 0 && !parsed.data.finished) {
			return progress.get(userId, address);
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
				rewatch: await viewer.rewatching(address.seriesId),
			})
			.onConflictDoUpdate({
				set: {
					...values,
					watchedAt: sql`now()`,
				},
				setWhere: sql`not ${episodeProgress.finished} or excluded.finished`,
				target: uniqueKey,
			})
			.returning();

		if (!row) {
			return progress.get(userId, address);
		}

		await viewer.after(address, values.finished);

		return new Played(row).progress;
	},

	/**
	 * A user's progress through a series: every episode of it they played, and
	 * the episode to play next, as {@link progress.continueWatching} picks it: none
	 * once every episode it lists is finished, unless they are rewatching it.
	 * During a rewatch both follow only what the user played since starting it.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 */
	async series(userId: string, seriesId: string): Promise<SeriesProgress> {
		const viewer = new Viewer(userId);

		await titles.assertExists(seriesId);

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
		const seriesEpisodes = await titles.episodes(seriesId);
		const finished = !rewatch && finishedCount > 0 && finishedCount >= seriesEpisodes.length;
		let next: NextEpisode | null = null;

		if (rewatch && !last) {
			next = {
				duration_seconds: null,
				episode: 1,
				position_seconds: 0,
			};
		} else if (last && !finished) {
			const upcoming = await viewer.next([last]);
			next = upcoming.get(seriesId) ?? null;
		}

		return {
			episodes: rows.map((row) => new Played(row).progress),
			finished,
			next,
			rewatch_started_at: startedAt?.toISOString() ?? null,
		};
	},
};
