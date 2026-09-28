import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import {
	continueWatchingDismissal,
	playbackHistory,
	playbackProgress,
	seriesEntry,
	seriesEpisode,
} from "../../database/schema";
import { EpisodeNotFoundError, InvalidInputError, SeasonNotFoundError } from "../../errors";
import { locateEpisode } from "../../series/episodes";
import { assertSeriesExists } from "../../series/queries";
import { markStarted } from "../entries/entries";
import { completionRatio, seriesProgress, type TitleProgress } from "./resume";
import { loadCheckpoints, loadTitles } from "./titles";

/** Clients may report events slightly in the future because of clock skew. */
const allowedClockSkewMs = 5 * 60_000;

/** Length assumed for an episode marked watched without playing it, when its runtime is unknown. */
const defaultEpisodeSeconds = 24 * 60;

/** A playback checkpoint reported by a client. */
export const ProgressUpdateSchema = z
	.object({
		seasonId: z.string().min(1),
		/** Position within the season, from 1. */
		episode: z.number().int().positive(),
		positionSeconds: z.number().nonnegative(),
		durationSeconds: z
			.number()
			.positive()
			.max(24 * 60 * 60),
		/**
		 * When the client observed this position. Later events win, so an old
		 * checkpoint from an offline device cannot overwrite newer progress.
		 */
		eventAt: z.iso.datetime({
			offset: true,
		}),
	})
	.refine((update) => update.positionSeconds <= update.durationSeconds, {
		message: "Position cannot exceed duration",
		path: ["positionSeconds"],
	});

export type ProgressUpdate = z.input<typeof ProgressUpdateSchema>;

/**
 * Records where playback of an episode stands, as the player reports it.
 *
 * Checkpoints are stored against the AniList episode that plays the season
 * episode, so progress survives the title being laid out again. Playing an
 * episode past {@link completionRatio} marks it watched; playing a watched
 * episode again keeps it watched. The playback also goes into the user's
 * history.
 *
 * Playing a title puts it in the library as `watching`, starts it if it was
 * `planning` (see {@link markStarted}), and brings it back to "continue
 * watching" if it was dismissed from there. Any other status is the user's
 * to change.
 *
 * @throws {@link InvalidInputError} when the update fails validation.
 * @throws {@link SeasonNotFoundError} when the season does not exist.
 * @throws {@link EpisodeNotFoundError} when the season has no such
 *   playable episode.
 */
export async function recordProgress(userId: string, update: ProgressUpdate) {
	const parsed = ProgressUpdateSchema.safeParse(update);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid progress update", {
			cause: parsed.error,
		});
	}

	const input = parsed.data;
	const now = Date.now();
	const eventAt = new Date(input.eventAt);
	if (eventAt.getTime() > now + allowedClockSkewMs) {
		throw new InvalidInputError("Progress event is in the future");
	}

	const located = await locateEpisode(input.seasonId, input.episode);
	const written = await writeCheckpoints(userId, [
		{
			anilistId: located.anilistId,
			episode: located.anilistEpisode,
			positionSeconds: input.positionSeconds,
			durationSeconds: input.durationSeconds,
			watched: input.positionSeconds >= input.durationSeconds * completionRatio,
			eventAt,
		},
	]);

	// A stale event changed nothing, so it must not change the library either.
	if (written === 0) {
		return;
	}

	await db
		.insert(playbackHistory)
		.values({
			userId,
			anilistId: located.anilistId,
			episode: located.anilistEpisode,
			positionSeconds: input.positionSeconds,
			durationSeconds: input.durationSeconds,
			playedAt: eventAt,
		})
		.onConflictDoUpdate({
			target: [playbackHistory.userId, playbackHistory.anilistId, playbackHistory.episode],
			set: {
				positionSeconds: sql`excluded.position_seconds`,
				durationSeconds: sql`excluded.duration_seconds`,
				playedAt: sql`excluded.played_at`,
			},
			setWhere: sql`${playbackHistory.playedAt} < excluded.played_at`,
		});
	await markStarted(userId, located.seriesId);
	await db
		.delete(continueWatchingDismissal)
		.where(
			and(
				eq(continueWatchingDismissal.userId, userId),
				eq(continueWatchingDismissal.seriesId, located.seriesId),
				lt(continueWatchingDismissal.dismissedAt, eventAt),
			),
		);
}

/** What {@link markWatched} marks. */
export const MarkWatchedSchema = z
	.object({
		seriesId: z.string().min(1),
		/** Only this season; every season in watch order when omitted. */
		seasonId: z.string().min(1).optional(),
		/** Only this episode of `seasonId`, from 1. */
		episode: z.number().int().positive().optional(),
	})
	.refine((target) => target.episode === undefined || target.seasonId !== undefined, {
		message: "An episode needs its season",
		path: ["seasonId"],
	});

export type MarkWatchedTarget = z.input<typeof MarkWatchedSchema>;

/**
 * Marks an episode, every released episode of a season, or every released
 * episode of a title in watch order, watched or unwatched.
 *
 * This changes episode state only: it is not playback, so it leaves the
 * user's history alone, and it never sets a library status such as
 * `completed`. Marking watched does start a `planning` title, as playing
 * it would (see {@link markStarted}), and wins over any saved playback of
 * the episodes, however recent. Marking unwatched forgets the episodes'
 * state, position included.
 *
 * @throws {@link InvalidInputError} when the target fails validation.
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 * @throws {@link SeasonNotFoundError} when the title has no such season.
 * @throws {@link EpisodeNotFoundError} when the season has no such released
 *   playable episode.
 */
export async function markWatched(userId: string, target: MarkWatchedTarget, watched: boolean) {
	const parsed = MarkWatchedSchema.safeParse(target);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid mark target", {
			cause: parsed.error,
		});
	}

	const { seriesId, seasonId, episode } = parsed.data;
	await assertSeriesExists(seriesId);
	const titles = await loadTitles([seriesId]);
	const listed = titles.episodes(seriesId);
	if (seasonId !== undefined && !listed.some((candidate) => candidate.seasonId === seasonId)) {
		throw new SeasonNotFoundError(seasonId);
	}

	const marked = listed.filter(
		(candidate) =>
			!candidate.isExtra &&
			candidate.isReleased &&
			(seasonId === undefined
				? candidate.inWatchOrder
				: candidate.seasonId === seasonId &&
					(episode === undefined || candidate.number === episode)),
	);
	if (episode !== undefined && marked.length === 0) {
		throw new EpisodeNotFoundError(seasonId!, episode);
	}
	if (marked.length === 0) {
		return;
	}

	const rows = await db
		.select({
			seasonId: seriesEpisode.seasonId,
			number: seriesEpisode.number,
			anilistId: seriesEpisode.anilistId,
			anilistEpisode: seriesEpisode.anilistEpisode,
			runtimeMinutes: seriesEpisode.runtimeMinutes,
		})
		.from(seriesEpisode)
		.where(
			inArray(seriesEpisode.seasonId, [...new Set(marked.map((candidate) => candidate.seasonId))]),
		);
	const order = new Map(
		marked.map((candidate, index) => [`${candidate.seasonId}:${candidate.number}`, index]),
	);
	const episodes = rows
		.filter((row) => row.anilistId !== null && order.has(`${row.seasonId}:${row.number}`))
		.sort(
			(left, right) =>
				order.get(`${left.seasonId}:${left.number}`)! -
				order.get(`${right.seasonId}:${right.number}`)!,
		);

	if (!watched) {
		await db
			.delete(playbackProgress)
			.where(
				and(
					eq(playbackProgress.userId, userId),
					or(
						...episodes.map((row) =>
							and(
								eq(playbackProgress.anilistId, row.anilistId!),
								eq(playbackProgress.episode, row.anilistEpisode!),
							),
						),
					),
				),
			);
		return;
	}

	// Episodes a user marks at once are recorded in watch order, a millisecond apart.
	const now = Date.now();
	await writeCheckpoints(
		userId,
		episodes.map((row, index) => {
			const seconds = (row.runtimeMinutes ?? 0) * 60 || defaultEpisodeSeconds;
			return {
				anilistId: row.anilistId!,
				episode: row.anilistEpisode!,
				positionSeconds: seconds,
				durationSeconds: seconds,
				watched: true,
				eventAt: new Date(now - episodes.length + index + 1),
			};
		}),
		{
			overwrite: true,
		},
	);
	await markStarted(userId, seriesId);
}

/**
 * A title's episode states in title order, with what is derived from them:
 * season progress, whether the user is caught up, and where to continue.
 *
 * Episodes the title no longer lists are left out, and a season that gained
 * episodes since it was finished is no longer complete.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function getProgress(userId: string, seriesId: string): Promise<TitleProgress> {
	await assertSeriesExists(seriesId);
	const [titles, checkpoints] = await Promise.all([
		loadTitles([seriesId]),
		loadCheckpoints(userId, [seriesId]),
	]);
	const episodes = titles.episodes(seriesId);
	const progress = checkpoints.get(seriesId) ?? [];
	const order = new Map(
		episodes.map((episode, index) => [`${episode.seasonId}:${episode.number}`, index]),
	);

	return {
		...seriesProgress(episodes, progress, titles.seasonTitles),
		episodes: progress
			.filter((checkpoint) => order.has(`${checkpoint.seasonId}:${checkpoint.episode}`))
			.sort(
				(left, right) =>
					order.get(`${left.seasonId}:${left.episode}`)! -
					order.get(`${right.seasonId}:${right.episode}`)!,
			),
	};
}

/**
 * Forgets every episode state of a title, for example to start it over. Its
 * library status and the user's history of it stay as they are.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function clearProgress(userId: string, seriesId: string) {
	await assertSeriesExists(seriesId);
	const entries = db
		.select({
			anilistId: seriesEntry.anilistId,
		})
		.from(seriesEntry)
		.where(eq(seriesEntry.seriesId, seriesId));

	await db
		.delete(playbackProgress)
		.where(and(eq(playbackProgress.userId, userId), inArray(playbackProgress.anilistId, entries)));
}

/** One checkpoint to write; see {@link writeCheckpoints}. */
export interface CheckpointInput {
	anilistId: number;
	episode: number;
	positionSeconds: number;
	durationSeconds: number;
	watched: boolean;
	eventAt: Date;
}

/** Checkpoint rows per insert, well under PostgreSQL's limit of 65,535 parameters. */
const checkpointBatch = 1_000;

/**
 * Upserts checkpoints. A checkpoint only replaces a saved one with an older
 * event, so an old event from an offline device changes nothing, and it
 * never takes back that an episode was watched.
 *
 * @param options.overwrite - Replace saved checkpoints whatever their event
 *   time, for a user's explicit choice, which wins over any playback.
 * @returns How many were written.
 */
export async function writeCheckpoints(
	userId: string,
	checkpoints: readonly CheckpointInput[],
	options: {
		overwrite?: boolean;
	} = {},
): Promise<number> {
	const updatedAt = new Date();
	let written = 0;
	for (let start = 0; start < checkpoints.length; start += checkpointBatch) {
		const rows = await db
			.insert(playbackProgress)
			.values(
				checkpoints.slice(start, start + checkpointBatch).map((checkpoint) => ({
					userId,
					...checkpoint,
					updatedAt,
				})),
			)
			.onConflictDoUpdate({
				target: [playbackProgress.userId, playbackProgress.anilistId, playbackProgress.episode],
				set: {
					positionSeconds: sql`excluded.position_seconds`,
					durationSeconds: sql`excluded.duration_seconds`,
					watched: sql`${playbackProgress.watched} or excluded.watched`,
					eventAt: sql`excluded.event_at`,
					updatedAt,
				},
				setWhere: options.overwrite
					? undefined
					: sql`${playbackProgress.eventAt} < excluded.event_at`,
			})
			.returning({
				episode: playbackProgress.episode,
			});
		written += rows.length;
	}

	return written;
}
