import type { WatchlistStatus } from "../../models/library";
/** What {@link statusAfterPlayback} needs to know about one play of an episode. */
export interface Playback {
	/** Whether the user finished the episode. */
	finished: boolean;
	/**
	 * Whether the episode is the series' last: the series has finished
	 * airing, and the episode's number is the episode count AniList gives it.
	 */
	isFinale: boolean;
}

/**
 * A series' watchlist status after the user played one of its episodes, or
 * `null` when it is not on the watchlist and stays off it.
 *
 * - A completed series stays completed, so a rewatch never undoes it.
 * - Finishing the finale completes the series, and puts it on the
 *   watchlist when it was not.
 * - Finishing any other episode of a series on the watchlist makes it
 *   `watching`, whatever it was.
 * - Stopping partway changes nothing, and a series off the watchlist stays
 *   off it until its finale is finished.
 */
export function statusAfterPlayback(
	current: WatchlistStatus | null,
	playback: Playback,
): WatchlistStatus | null {
	if (current === "completed") {
		return current;
	}

	if (playback.finished && playback.isFinale) {
		return "completed";
	}

	if (current && playback.finished) {
		return "watching";
	}

	return current;
}
