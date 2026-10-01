import { and, desc, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { z } from "zod";

import { db } from "../../database/client";
import {
	droppedSeries,
	episodeProgress,
	profileShow,
	series,
	seriesEpisode,
	seriesSeason,
	watchedEpisode,
} from "../../database/schema";
import { EpisodeNotFoundError, InvalidInputError } from "../../errors";
import type { SeriesCard } from "../../series/models";
import {
	adjacentEpisodes,
	assertSeriesExists,
	getPlayableSeasons,
	getSeasonSeriesId,
	toSeriesCards,
	type EpisodeAddress,
	type PlayableSeason,
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
	 * The episodes of the show the user watched, in no particular order: the
	 * ones they finished at some point, and the ones they marked. One stays
	 * here while its progress is unfinished again from playing it a second
	 * time.
	 */
	watched: EpisodeAddress[];
	/** The seasons whose every episode that can be played is in `watched`. */
	watchedSeasons: string[];
	/**
	 * The seasons the user completed: the ones in `watchedSeasons` that have
	 * finished coming out. A season still airing is never complete, however
	 * much of it the user watched.
	 */
	completedSeasons: string[];
	/**
	 * Whether the user completed the show: every regular season of its story
	 * that has an episode out is in `completedSeasons`. Films, OVAs, and
	 * specials do not count, unless the show has no regular season; nor does
	 * a season announced with nothing out yet. A new season starting to air
	 * makes a completed show incomplete again.
	 */
	completed: boolean;
	/**
	 * The episode to play next, or `null` when the user played none of the
	 * show, or nothing comes after the last one they finished; see
	 * {@link getContinueWatching}.
	 */
	next: NextEpisode | null;
	/**
	 * The first episode of the part that comes after, when `next` is `null`
	 * because the show does not go on into that part by itself: a season
	 * still airing, a film, an OVA, or a special. The user starts it to go on.
	 */
	offered: NextEpisode | null;
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
 * Playing an episode puts its series in the user's Shows (see `getShows`).
 * The first time the episode is finished, it enters the user's history
 * (see `getHistory`), where it stays whatever is saved for it later.
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
			seriesId: seriesSeason.seriesId,
		})
		.from(seriesEpisode)
		.innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
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
	const row = await db.transaction(async (tx) => {
		const [saved] = await tx
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
		await tx
			.insert(profileShow)
			.values({
				userId,
				seriesId: playable.seriesId,
			})
			.onConflictDoNothing();
		if (values.finished) {
			await tx
				.insert(watchedEpisode)
				.values({
					userId,
					seasonId: address.seasonId,
					episode: address.episode,
				})
				.onConflictDoNothing();
		}

		return saved!;
	});

	return toProgress(row);
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
 * A user's progress through a show: every episode of it they played, the
 * ones they watched, and the episode to play next, as
 * {@link getContinueWatching} picks it.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function getSeriesProgress(userId: string, seriesId: string): Promise<SeriesProgress> {
	await assertSeriesExists(seriesId);
	const [seasons, rows, watched, [last]] = await Promise.all([
		getPlayableSeasons([seriesId]),
		db
			.select({
				progress: episodeProgress,
			})
			.from(episodeProgress)
			.innerJoin(seriesSeason, eq(seriesSeason.id, episodeProgress.seasonId))
			.where(and(eq(episodeProgress.userId, userId), eq(seriesSeason.seriesId, seriesId)))
			.orderBy(desc(episodeProgress.watchedAt)),
		db
			.select({
				seasonId: watchedEpisode.seasonId,
				episode: watchedEpisode.episode,
			})
			.from(watchedEpisode)
			.innerJoin(seriesSeason, eq(seriesSeason.id, watchedEpisode.seasonId))
			.where(and(eq(watchedEpisode.userId, userId), eq(seriesSeason.seriesId, seriesId))),
		lastEpisodes(userId, eq(seriesSeason.seriesId, seriesId)),
	]);
	const upNext = last ? (await nextEpisodes(userId, [last])).get(seriesId) : undefined;

	const seen = new Set(watched.map((address) => `${address.seasonId}:${address.episode}`));
	const out = (seasons.get(seriesId) ?? []).filter((season) => season.episodes.length > 0);
	const isWatched = (season: PlayableSeason) =>
		season.episodes.every((episode) => seen.has(`${season.id}:${episode}`));
	const isCompleted = (season: PlayableSeason) => !season.airing && isWatched(season);

	const story = out.filter((season) => season.inWatchOrder);
	const regular = story.filter((season) => season.kind === "season");
	const counted = regular.length > 0 ? regular : story.length > 0 ? story : out;

	return {
		episodes: rows.map((row) => toProgress(row.progress)),
		watched,
		watchedSeasons: out.filter(isWatched).map((season) => season.id),
		completedSeasons: out.filter(isCompleted).map((season) => season.id),
		completed: counted.length > 0 && counted.every(isCompleted),
		next: upNext?.next ?? null,
		offered: upNext?.offered ?? null,
	};
}

/**
 * The shows a user is in the middle of, the most recently played first,
 * each with the episode to play next.
 *
 * A show is judged by the episode the user played last, or marked watched
 * since. While that episode is unfinished, it is the one to play. Once it
 * is finished, the episode after it is (see `getAdjacentEpisodes`), from
 * where the user left it if they started it before. A show with no episode
 * after it is left out until one comes out; so is one whose next season is
 * still airing, or whose next part is a film, an OVA, or a special, until
 * the user starts that themselves.
 *
 * Only series in the user's Shows are listed (see `removeShow`), less the
 * ones they dropped (see `dropShow`) and the ones whose card they took out
 * since (see {@link dismissContinueWatching}). Only the {@link recentShows}
 * most recently played of them are looked at.
 */
export async function getContinueWatching(userId: string): Promise<ContinueWatching[]> {
	const played = await lastEpisodes(
		userId,
		and(
			sql`exists (
				select 1 from ${profileShow}
				where ${profileShow.userId} = ${userId}
					and ${profileShow.seriesId} = ${seriesSeason.seriesId}
					and (${profileShow.dismissedAt} is null or ${profileShow.dismissedAt} < "events"."at")
			)`,
			sql`not exists (
				select 1 from ${droppedSeries}
				where ${droppedSeries.userId} = ${userId}
					and ${droppedSeries.seriesId} = ${seriesSeason.seriesId}
			)`,
		),
		recentShows,
	);

	const upNext = await nextEpisodes(userId, played);
	const listed = played.filter(({ seriesId }) => upNext.get(seriesId)?.next);
	if (listed.length === 0) {
		return [];
	}

	const cards = await toSeriesCards(
		await db
			.select()
			.from(series)
			.where(
				inArray(
					series.id,
					listed.map(({ seriesId }) => seriesId),
				),
			),
	);

	return listed.flatMap(({ seriesId }) => {
		const card = cards.get(seriesId);
		const episode = upNext.get(seriesId)?.next;
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
 * Takes a show's card out of what {@link getContinueWatching} lists. The
 * user's progress and history in the show stay, and so does the show in
 * their Shows; playing or marking an episode of it brings the card back.
 */
export async function dismissContinueWatching(userId: string, seriesId: string) {
	await db
		.update(profileShow)
		.set({
			dismissedAt: sql`now()`,
		})
		.where(and(eq(profileShow.userId, userId), eq(profileShow.seriesId, seriesId)));
}

/**
 * Marks an episode as watched without playing it, and puts its series in
 * the user's Shows. An episode the user finished stays as it is. The
 * episode enters their history (see `getHistory`) at the time of marking.
 *
 * @throws {@link EpisodeNotFoundError} when the season has no such episode
 *   that can be played.
 */
export async function markEpisode(userId: string, address: EpisodeAddress) {
	const [playable] = await db
		.select({
			seriesId: seriesSeason.seriesId,
		})
		.from(seriesEpisode)
		.innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
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

	await db.transaction(async (tx) => {
		await tx
			.insert(watchedEpisode)
			.values({
				userId,
				...address,
				marked: true,
			})
			.onConflictDoNothing();
		await tx
			.insert(profileShow)
			.values({
				userId,
				seriesId: playable.seriesId,
			})
			.onConflictDoNothing();
	});
}

/**
 * Makes an episode unwatched: takes it out of the user's history, and
 * forgets where they stopped in it.
 */
export async function unmarkEpisode(userId: string, address: EpisodeAddress) {
	await db.transaction(async (tx) => {
		await tx
			.delete(watchedEpisode)
			.where(
				and(
					eq(watchedEpisode.userId, userId),
					eq(watchedEpisode.seasonId, address.seasonId),
					eq(watchedEpisode.episode, address.episode),
				),
			);
		await tx
			.delete(episodeProgress)
			.where(
				and(
					eq(episodeProgress.userId, userId),
					eq(episodeProgress.seasonId, address.seasonId),
					eq(episodeProgress.episode, address.episode),
				),
			);
	});
}

/**
 * Marks every episode of a season that can be played as watched, without
 * playing them, and puts the series in the user's Shows. Episodes the user
 * finished stay as they are. The marked episodes enter their history (see
 * `getHistory`) at the time of marking.
 *
 * @throws {@link SeasonNotFoundError} when the season does not exist.
 */
export async function markSeason(userId: string, seasonId: string) {
	const seriesId = await getSeasonSeriesId(seasonId);
	const season = (await getPlayableSeasons([seriesId]))
		.get(seriesId)
		?.find((candidate) => candidate.id === seasonId);
	if (!season || season.episodes.length === 0) {
		return;
	}

	await db.transaction(async (tx) => {
		await tx
			.insert(watchedEpisode)
			.values(
				season.episodes.map((episode) => ({
					userId,
					seasonId,
					episode,
					marked: true,
				})),
			)
			.onConflictDoNothing();
		await tx
			.insert(profileShow)
			.values({
				userId,
				seriesId,
			})
			.onConflictDoNothing();
	});
}

/**
 * Makes a season unwatched: forgets which of its episodes the user watched,
 * finished or marked, and where they stopped in them, as
 * {@link unmarkEpisode} does for one.
 *
 * @throws {@link SeasonNotFoundError} when the season does not exist.
 */
export async function unmarkSeason(userId: string, seasonId: string) {
	await getSeasonSeriesId(seasonId);
	await db.transaction(async (tx) => {
		await tx
			.delete(watchedEpisode)
			.where(and(eq(watchedEpisode.userId, userId), eq(watchedEpisode.seasonId, seasonId)));
		await tx
			.delete(episodeProgress)
			.where(and(eq(episodeProgress.userId, userId), eq(episodeProgress.seasonId, seasonId)));
	});
}

/**
 * The episode a user last had to do with in each show, the most recent
 * show first: the one they played last, or the last one of a season they
 * marked watched since, which counts as finished.
 *
 * @param where - Narrows the shows; may refer to `seriesSeason` and to the
 *   time of the episode as `"events"."at"`.
 */
async function lastEpisodes(userId: string, where: SQL | undefined, limit?: number) {
	const events = unionAll(
		db
			.select({
				seasonId: episodeProgress.seasonId,
				episode: episodeProgress.episode,
				finished: episodeProgress.finished,
				at: sql<Date>`${episodeProgress.watchedAt}`.mapWith(episodeProgress.watchedAt).as("at"),
			})
			.from(episodeProgress)
			.where(eq(episodeProgress.userId, userId)),
		db
			.select({
				seasonId: watchedEpisode.seasonId,
				episode: watchedEpisode.episode,
				finished: sql<boolean>`true`.as("finished"),
				at: sql<Date>`${watchedEpisode.finishedAt}`.mapWith(episodeProgress.watchedAt).as("at"),
			})
			.from(watchedEpisode)
			.where(and(eq(watchedEpisode.userId, userId), eq(watchedEpisode.marked, true))),
	).as("events");
	const latest = db
		.selectDistinctOn([seriesSeason.seriesId], {
			seriesId: seriesSeason.seriesId,
			seasonId: events.seasonId,
			episode: events.episode,
			finished: events.finished,
			at: events.at,
		})
		.from(events)
		.innerJoin(seriesSeason, eq(seriesSeason.id, events.seasonId))
		.where(where)
		.orderBy(seriesSeason.seriesId, desc(events.at), desc(events.episode))
		.as("latest");
	const query = db.select().from(latest).orderBy(desc(latest.at));

	return limit === undefined ? query : query.limit(limit);
}

/**
 * What comes next in each of a user's shows, keyed by series ID, as
 * {@link getContinueWatching} and `getShows` tell it; see {@link nextEpisodes}.
 */
export async function getNextEpisodes(userId: string) {
	return nextEpisodes(userId, await lastEpisodes(userId, undefined));
}

/**
 * What comes next in each show, keyed by series ID, given the episode the
 * user last had to do with in it. `next` is that episode while it is
 * unfinished, else the one after it (see `adjacentEpisodes`), with the
 * progress the user has in that one. `offered` is the episode the show
 * stops before instead, when it does. A show whose season is no longer
 * listed is left out.
 */
async function nextEpisodes(
	userId: string,
	played: readonly (EpisodeAddress & {
		seriesId: string;
		finished: boolean;
	})[],
): Promise<
	Map<
		string,
		{
			next: NextEpisode | null;
			offered: NextEpisode | null;
		}
	>
> {
	const seasons = await getPlayableSeasons(played.map((last) => last.seriesId));
	const found = played.flatMap((last) => {
		const listed = seasons.get(last.seriesId) ?? [];
		const adjacent = last.finished
			? adjacentEpisodes(listed, last.seasonId, last.episode)
			: {
					next: last,
					offered: null,
				};
		return adjacent
			? [
					{
						seriesId: last.seriesId,
						listed,
						next: adjacent.next,
						offered: adjacent.offered,
					},
				]
			: [];
	});

	const addresses = found.flatMap(({ next, offered }) =>
		[next, offered].filter((address) => address !== null),
	);
	const started =
		addresses.length > 0
			? await db
					.select()
					.from(episodeProgress)
					.where(
						and(
							eq(episodeProgress.userId, userId),
							eq(episodeProgress.finished, false),
							or(
								...addresses.map((address) =>
									and(
										eq(episodeProgress.seasonId, address.seasonId),
										eq(episodeProgress.episode, address.episode),
									),
								),
							),
						),
					)
			: [];

	const describe = (listed: readonly PlayableSeason[], address: EpisodeAddress | null) => {
		const season = listed.find((candidate) => candidate.id === address?.seasonId);
		if (!address || !season) {
			return null;
		}

		const unfinished = started.find(
			(row) => row.seasonId === address.seasonId && row.episode === address.episode,
		);
		return {
			seasonId: season.id,
			seasonTitle: season.title,
			seasonKind: season.kind,
			episode: address.episode,
			positionSeconds: unfinished?.positionSeconds ?? 0,
			durationSeconds: unfinished?.durationSeconds ?? null,
		};
	};

	return new Map(
		found.map(({ seriesId, listed, next, offered }) => [
			seriesId,
			{
				next: describe(listed, next),
				offered: describe(listed, offered),
			},
		]),
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
