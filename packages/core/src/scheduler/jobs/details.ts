import type { Task } from "graphile-worker";

import { refreshStaleAnime } from "../../catalog/queries/anime";
import { storeTitleFacts } from "../../series/facts";

/** The graphile-worker task that fetches stored anime again that lack fields; see `refreshStaleAnime`. */
export const refreshStaleAnimeTask = "refresh-stale-anime";

/**
 * Fetches again stored anime whose copy lacks fields the details fragment
 * asks for now. Once every copy has them, a run only reads the database.
 */
export const refreshStaleAnimeJob: Task = async (_payload, helpers) => {
	const { refreshed, skipped } = await refreshStaleAnime();
	if (refreshed + skipped > 0) {
		helpers.logger.info(`Refreshed ${refreshed} stale anime; ${skipped} are gone from AniList`);
	}
};

/** The graphile-worker task that keeps titles' ratings and awards; see `storeTitleFacts`. */
export const storeTitleFactsTask = "store-title-facts";

/** Fetches TMDB's certification and IMDb's awards for titles that have none, or old ones. */
export const storeTitleFactsJob: Task = async (_payload, helpers) => {
	const { stored, awarded } = await storeTitleFacts();
	if (stored > 0) {
		helpers.logger.info(`Stored facts of ${stored} titles, ${awarded} with awards`);
	}
};
