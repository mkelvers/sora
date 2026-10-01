import {
	adjacentEpisodes,
	type AdjacentEpisodes,
	type EpisodeAddress,
	type PlayableSeason,
} from "../../series/queries";

/** The episode a user last had to do with in a show. */
export interface LastEpisode extends EpisodeAddress {
	/** Whether they finished it, or marked it watched. */
	finished: boolean;
	/** When they played or marked it. */
	at: Date;
}

/**
 * What a show plays next, given its seasons and the episode the user last
 * had to do with: that episode while it is unfinished, else the one after
 * it (see `adjacentEpisodes`).
 *
 * A show goes on into the next season only when all of that season was out
 * by the time the user finished the one before it. A season that came out
 * later is `offered` instead, as one still airing is, and stays offered once
 * it has finished airing: a new season never puts a show the user was done
 * with back in front of them. They start it themselves to go on.
 *
 * @returns `null` when the episode's season is not among the seasons.
 */
export function nextEpisode(
	seasons: readonly PlayableSeason[],
	last: LastEpisode,
): Pick<AdjacentEpisodes, "next" | "offered"> | null {
	if (!last.finished) {
		return seasons.some((season) => season.id === last.seasonId)
			? {
					next: {
						seasonId: last.seasonId,
						episode: last.episode,
					},
					offered: null,
				}
			: null;
	}

	const adjacent = adjacentEpisodes(seasons, last.seasonId, last.episode);
	if (!adjacent) {
		return null;
	}

	const { next, offered } = adjacent;
	const into = seasons.find((season) => season.id === next?.seasonId);
	const cameLater =
		into !== undefined &&
		into.id !== last.seasonId &&
		into.releasedAt !== null &&
		into.releasedAt > last.at;

	return cameLater
		? {
				next: null,
				offered: next,
			}
		: {
				next,
				offered,
			};
}
