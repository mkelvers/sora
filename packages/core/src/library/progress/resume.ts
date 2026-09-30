import type { SeriesCard } from "../../series/models";

/**
 * Share of an episode that must be played for it to count as watched.
 * Leaves room for ending credits and previews.
 */
export const completionRatio = 0.9;

/** One episode's state: whether it is watched, and where playback of it stands. */
export interface EpisodeProgress {
	seasonId: string;
	/** Position within the season, from 1. */
	episode: number;
	positionSeconds: number;
	durationSeconds: number;
	watched: boolean;
	/** ISO 8601 timestamp of the event that produced this state. */
	eventAt: string;
}

/** A season of a title, named. */
export interface NamedSeason {
	seasonId: string;
	/** Such as "Season 2" or the film's title. */
	title: string;
}

/** How far a user is through one season, read from their episode progress. */
export interface SeasonProgress extends NamedSeason {
	/** Released episodes of the season watched, extras aside. */
	watchedEpisodes: number;
	/** Released episodes of the season, extras aside. */
	releasedEpisodes: number;
	/**
	 * Whether the season has finished airing and every one of its episodes
	 * is watched. It says nothing about the series' library status.
	 */
	completed: boolean;
}

/**
 * How far a user is through a title, read from their episode progress
 * rather than stored, so it stays true as the title gains episodes.
 */
export interface SeriesProgress {
	/** Every season with a released episode, in title order. */
	seasons: SeasonProgress[];
	/** Released episodes in watch order watched, extras aside. */
	watchedEpisodes: number;
	/** Released episodes in watch order, extras aside. */
	releasedEpisodes: number;
	/**
	 * Whether every released episode in watch order is watched. Unlike a
	 * `completed` library status, a new episode or season takes it back.
	 */
	caughtUp: boolean;
	/**
	 * Whether the user finished every main season they started, and started
	 * one. Films, OVAs, and specials never hold it back, and neither does a
	 * season they have not started (see {@link unwatchedSeason}); a title of
	 * films alone counts its films. A season
	 * still airing is not finished, so neither is a title they are keeping
	 * up with.
	 */
	finished: boolean;
	/**
	 * Where to pick the title back up; see {@link continuePoint}. When that
	 * starts a season, it starts {@link unwatchedSeason} instead, so a main
	 * season the user skipped comes before the ones after it.
	 */
	next: ContinuePoint | null;
	/**
	 * A season the user has not started that they can watch, offered once
	 * there is nothing to continue, such as one released since; see
	 * {@link unstartedSeason}.
	 */
	newSeason: NamedSeason | null;
	/**
	 * The first main season with a released episode that the user has not
	 * started, wherever it falls, once they started the title: one released
	 * since, or one they skipped. Films, OVAs, and specials are never it,
	 * except in a title of films alone. `null` when there is none.
	 */
	unwatchedSeason: NamedSeason | null;
	/** ISO 8601 timestamp of the latest change to an episode's state, or `null`. */
	lastWatchedAt: string | null;
}

/** A title's episode states, and what is derived from them. */
export interface TitleProgress extends SeriesProgress {
	/** The state of every episode played or marked watched, in title order. */
	episodes: EpisodeProgress[];
}

/** Where to pick a title back up. */
export interface ContinueWatchingItem {
	series: SeriesCard;
	seasonId: string;
	/** Position within the season, from 1. */
	episode: number;
	/** Seek position; `0` when starting the next episode. */
	positionSeconds: number;
	/** Known duration of `episode`, or `null` when it has not been played yet. */
	durationSeconds: number | null;
	/** ISO 8601 timestamp of the last playback event for this title. */
	lastWatchedAt: string;
}

/** One episode of a title, as the resume rules see it. */
export interface TitleEpisode {
	seasonId: string;
	/** A main season, or a film or OVA; only main seasons decide whether a title is {@link SeriesProgress.finished}. */
	seasonKind: "season" | "ova" | "movie";
	/** See `SeriesSeason.inWatchOrder`. */
	inWatchOrder: boolean;
	/** Position within the season, from 1. */
	number: number;
	/** An extra only TMDB lists, which cannot be played. */
	isExtra: boolean;
	isReleased: boolean;
	/** ISO 8601 timestamp of when it aired, or `null` when unknown. */
	releasedAt: string | null;
	/**
	 * Whether it ends its season: the season's last playable episode, once
	 * the season has finished airing. Only a season with one can be completed.
	 */
	isFinale: boolean;
}

/** Where {@link continuePoint} resumes. */
export type ContinuePoint = Pick<
	ContinueWatchingItem,
	"seasonId" | "episode" | "positionSeconds" | "durationSeconds"
>;

/**
 * Decides where to resume a title.
 *
 * An unfinished latest episode resumes where it stopped, even one watched
 * before and now played again. After a finished episode, the next playable
 * episode follows, crossing into the next season in watch order: the last episode of season 1 leads to the film after it
 * or to season 2, but the watch order does not lead into the extras. That
 * next episode resumes from its own checkpoint if one exists (it may have
 * been started earlier or on another device), or starts from zero if it has
 * been released.
 *
 * Within a season the next episode follows whenever it is released. The
 * next season only follows when it was already out as the last one was
 * finished: a season released afterwards is offered, not pushed.
 *
 * @param episodes - Every episode of the title, in title order: seasons in
 *   display order, episodes by number.
 * @param progress - The title's checkpoints, most recent first.
 * @returns Where to resume, or `null` when there is nothing to continue.
 */
export function continuePoint(
	episodes: readonly TitleEpisode[],
	progress: readonly EpisodeProgress[],
): ContinuePoint | null {
	const latest = progress[0];
	if (!latest) {
		return null;
	}

	if (!isFinished(latest)) {
		return {
			seasonId: latest.seasonId,
			episode: latest.episode,
			positionSeconds: latest.positionSeconds,
			durationSeconds: latest.durationSeconds,
		};
	}

	const index = episodes.findIndex(
		(episode) => episode.seasonId === latest.seasonId && episode.number === latest.episode,
	);
	const current = episodes[index];
	const next =
		index >= 0 ? episodes.slice(index + 1).find((episode) => !episode.isExtra) : undefined;
	if (!current || !next || next.inWatchOrder !== current.inWatchOrder) {
		return null;
	}

	const started = progress.find(
		(checkpoint) =>
			checkpoint.seasonId === next.seasonId &&
			checkpoint.episode === next.number &&
			!isFinished(checkpoint),
	);
	if (started) {
		return {
			seasonId: next.seasonId,
			episode: next.number,
			positionSeconds: started.positionSeconds,
			durationSeconds: started.durationSeconds,
		};
	}

	const releasedSince =
		next.seasonId !== current.seasonId &&
		next.releasedAt !== null &&
		next.releasedAt > latest.eventAt;
	return next.isReleased && !releasedSince
		? {
				seasonId: next.seasonId,
				episode: next.number,
				positionSeconds: 0,
				durationSeconds: null,
			}
		: null;
}

/**
 * Derives how far a user is through a title from their episode progress;
 * see {@link SeriesProgress}.
 *
 * @param episodes - Every episode of the title, in title order.
 * @param progress - The title's checkpoints, most recent first.
 * @param seasonTitles - Season titles by season ID.
 */
export function seriesProgress(
	episodes: readonly TitleEpisode[],
	progress: readonly EpisodeProgress[],
	seasonTitles: ReadonlyMap<string, string>,
): SeriesProgress {
	const released = episodes.filter((episode) => episode.isReleased && !episode.isExtra);
	const watched = (episode: TitleEpisode) => find(progress, episode)?.watched === true;
	const named = (seasonId: string): NamedSeason => ({
		seasonId,
		title: seasonTitles.get(seasonId) ?? "",
	});

	const seasons = [...new Set(released.map((episode) => episode.seasonId))].map((seasonId) => {
		const inSeason = released.filter((episode) => episode.seasonId === seasonId);
		const watchedEpisodes = inSeason.filter(watched).length;
		return {
			...named(seasonId),
			watchedEpisodes,
			releasedEpisodes: inSeason.length,
			completed:
				watchedEpisodes === inSeason.length && inSeason.some((episode) => episode.isFinale),
		};
	});

	const inWatchOrder = released.filter((episode) => episode.inWatchOrder);
	const watchedEpisodes = inWatchOrder.filter(watched).length;
	const caughtUp = inWatchOrder.length > 0 && watchedEpisodes === inWatchOrder.length;
	const main = released.filter((episode) => episode.seasonKind === "season");
	const counted = new Set(
		(main.length > 0 ? main : inWatchOrder).map((episode) => episode.seasonId),
	);
	const started = new Set(
		[...counted].filter((seasonId) =>
			progress.some((checkpoint) => checkpoint.seasonId === seasonId),
		),
	);
	const unwatched =
		started.size > 0 ? [...counted].find((seasonId) => !started.has(seasonId)) : undefined;
	const point = continuePoint(episodes, progress);
	// Starting a new season starts the earliest main season not started, so a skipped one comes first.
	const skippedTo =
		point && unwatched && !progress.some((checkpoint) => checkpoint.seasonId === point.seasonId)
			? released.find((episode) => episode.seasonId === unwatched)
			: undefined;
	const next: ContinuePoint | null = skippedTo
		? {
				seasonId: skippedTo.seasonId,
				episode: skippedTo.number,
				positionSeconds: 0,
				durationSeconds: null,
			}
		: point;
	const unstarted = next ? null : unstartedSeason(episodes, progress);

	return {
		seasons,
		watchedEpisodes,
		releasedEpisodes: inWatchOrder.length,
		caughtUp,
		finished:
			started.size > 0 &&
			seasons.every((season) => !started.has(season.seasonId) || season.completed),
		next,
		newSeason: unstarted ? named(unstarted) : null,
		unwatchedSeason: unwatched ? named(unwatched) : null,
		lastWatchedAt: progress[0]?.eventAt ?? null,
	};
}

/**
 * The first season in watch order after the furthest one a user started
 * that they have not started and can watch: what a title offers once they
 * are through what they began. `null` when there is none, or before they
 * played anything.
 *
 * @param progress - The title's checkpoints, most recent first.
 */
export function unstartedSeason(
	episodes: readonly TitleEpisode[],
	progress: readonly EpisodeProgress[],
): string | null {
	const ordered = episodes.filter((episode) => episode.inWatchOrder && !episode.isExtra);
	const furthest = ordered.findLastIndex((episode) =>
		progress.some((checkpoint) => checkpoint.seasonId === episode.seasonId),
	);
	if (furthest === -1) {
		return null;
	}

	const startedSeason = ordered[furthest]!.seasonId;
	const next = ordered
		.slice(furthest + 1)
		.find((episode) => episode.seasonId !== startedSeason && episode.isReleased);
	return next && !progress.some((checkpoint) => checkpoint.seasonId === next.seasonId)
		? next.seasonId
		: null;
}

/** Whether playback of an episode reached its end, rather than stopping part-way. */
function isFinished(checkpoint: EpisodeProgress) {
	return (
		checkpoint.watched && checkpoint.positionSeconds >= checkpoint.durationSeconds * completionRatio
	);
}

function isAt(checkpoint: EpisodeProgress, episode: TitleEpisode) {
	return checkpoint.seasonId === episode.seasonId && checkpoint.episode === episode.number;
}

function find(progress: readonly EpisodeProgress[], episode: TitleEpisode) {
	return progress.find((checkpoint) => isAt(checkpoint, episode));
}
