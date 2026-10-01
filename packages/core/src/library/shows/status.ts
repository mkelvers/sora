import type { EpisodeAddress, PlayableSeason } from "../../series/queries";

/**
 * Where a user is with a show:
 *
 * - `planned`: saved, with nothing played or watched yet.
 * - `watching`: in the middle of it. A season they started is not complete,
 *   or the season after was already out when they finished.
 * - `completed`: finished every season they started, with no season after
 *   them that was out by then. One that came out since is offered, and
 *   changes nothing until they start it.
 * - `dropped`: given up on, by their own choice (see `dropShow`).
 */
export type ShowStatus = "planned" | "watching" | "completed" | "dropped";

/** What one user has done in one show. */
export interface ShowActivity {
	/** The IDs of the seasons they played or watched an episode of. */
	seasonIds: ReadonlySet<string>;
	/** When they watched each episode they did, by `"<season ID>:<episode>"`. */
	watched: ReadonlyMap<string, Date>;
	/** The episode the show plays next for them; see `nextEpisode`. */
	next: EpisodeAddress | null;
}

/**
 * The seasons among some that count toward completing a show: the regular
 * seasons in watch order. Without one, the films and OVAs in watch order
 * count, and without those, every season given.
 */
export function countedSeasons(seasons: readonly PlayableSeason[]) {
	const story = seasons.filter((season) => season.inWatchOrder);
	const regular = story.filter((season) => season.kind === "season");

	return regular.length > 0 ? regular : story.length > 0 ? story : seasons;
}

/**
 * The status of a show from what the user did in it, other than `dropped`,
 * which is theirs to set.
 *
 * A season is complete when every episode of it that can be played is
 * watched and it has finished coming out. Of the seasons the user started,
 * the ones that count are told by {@link countedSeasons}. The show is
 * `watching` while any of these holds, and `completed` otherwise:
 *
 * - A counted season they started is not complete, which being caught up
 *   with a season still airing is too.
 * - The counted season after the last one they started had finished coming
 *   out when they finished that one. Films and OVAs in between do not
 *   matter, though playback stops before them.
 * - The episode the show plays next is one they have not watched.
 *
 * A season that came out after they finished meets none of them, so the
 * show stays `completed` until they start it. Watching an episode again
 * changes nothing, and neither does a season finishing its run.
 */
export function statusOf(
	seasons: readonly PlayableSeason[],
	activity: ShowActivity,
): Exclude<ShowStatus, "dropped"> {
	if (activity.seasonIds.size === 0) {
		return "planned";
	}

	const { next } = activity;
	if (next && !activity.watched.has(`${next.seasonId}:${next.episode}`)) {
		return "watching";
	}

	const out = seasons.filter((season) => season.episodes.length > 0);
	const started = countedSeasons(out.filter((season) => activity.seasonIds.has(season.id)));
	const isComplete = (season: PlayableSeason) =>
		!season.airing &&
		season.episodes.every((episode) => activity.watched.has(`${season.id}:${episode}`));
	const last = started.at(-1);
	if (!last || !started.every(isComplete)) {
		return "watching";
	}

	const line = countedSeasons(out);
	const after = line.includes(last) ? line[line.indexOf(last) + 1] : undefined;
	if (!after || after.airing) {
		return "completed";
	}

	const finishedAt = Math.max(
		...last.episodes.map(
			(episode) => activity.watched.get(`${last.id}:${episode}`)?.getTime() ?? 0,
		),
	);
	const wasOut = after.releasedAt === null || after.releasedAt.getTime() <= finishedAt;

	return wasOut ? "watching" : "completed";
}
