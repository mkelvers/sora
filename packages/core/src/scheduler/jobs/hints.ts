import type { Task } from "graphile-worker";

import { syncTmdbHints } from "../../series/hints";
import { expireMappingsAgainstHints } from "../../series/mapping";
import { scheduleStoredSeriesRefresh } from "../queue";

/** The graphile-worker task that keeps the TMDB hints current. */
export const syncTmdbHintsTask = "sync-tmdb-hints";

/**
 * Brings the TMDB hints up to date with Fribb/anime-lists, then has every
 * entry whose hint changed matched again and its stored series laid out
 * again, unless the entry already maps to a hinted title.
 *
 * The list changes about weekly on no fixed day; runs that find it unchanged
 * write nothing. A failed download throws, so graphile-worker retries it,
 * while matching goes on with the stored hints.
 */
export const syncTmdbHintsJob: Task = async (_payload, helpers) => {
  const changed = await syncTmdbHints();
  const expired = await expireMappingsAgainstHints(changed);
  for (const anilistId of expired) {
    await scheduleStoredSeriesRefresh(anilistId, "backfill");
  }

  helpers.logger.info(`${changed.length} TMDB hints changed; matching ${expired.length} entries again`);
};
