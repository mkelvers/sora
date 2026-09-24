import { sql } from "drizzle-orm";

import { db } from "../database/client";

/** The graphile-worker task that follows one anime while it airs. */
export const trackAiringTask = "track-airing";

/**
 * Where the airing tracker left off for one anime, carried from each run of
 * {@link trackAiringTask} to the next.
 */
export interface TrackAiringPayload {
  anilistId: number;
  /** The aired episode no provider has released yet, or `null` when caught up. */
  awaitedEpisode: number | null;
  /** How many checks have already failed to find `awaitedEpisode`. */
  attempt: number;
}

/**
 * Each anime has at most one pending airing check, identified by this key.
 * It is also written in SQL by `reviveAiringChecks`.
 */
function airingJobKey(anilistId: number) {
  return `airing:${anilistId}`;
}

/**
 * Schedules the next airing check for an anime, replacing any pending one.
 *
 * Called by the tracker at the end of each run.
 */
export async function scheduleAiringCheck(payload: TrackAiringPayload, runAt: Date) {
  await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${trackAiringTask},
      payload => ${payloadJson(payload)},
      run_at => ${runAt.toISOString()}::timestamptz,
      job_key => ${airingJobKey(payload.anilistId)},
      job_key_mode => 'replace'
    )
  `);
}

/**
 * Starts tracking an anime that has not finished airing.
 *
 * Does nothing when the anime already has a check, so a pending check keeps
 * its time and progress.
 */
export async function startTrackingAiring(anilistId: number) {
  await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${trackAiringTask},
      payload => ${payloadJson({
        anilistId,
        awaitedEpisode: null,
        attempt: 0
      })},
      job_key => ${airingJobKey(anilistId)},
      job_key_mode => 'unsafe_dedupe'
    )
  `);
}

/**
 * Builds the payload in SQL, since the driver would send a serialized
 * payload as a JSON string rather than an object.
 */
function payloadJson(payload: TrackAiringPayload) {
  return sql`json_build_object(
    'anilistId', ${payload.anilistId}::int,
    'awaitedEpisode', ${payload.awaitedEpisode}::float8,
    'attempt', ${payload.attempt}::int
  )`;
}

/** The graphile-worker task that lays out and stores the series of one AniList entry. */
export const storeSeriesTask = "store-series";

/** What {@link storeSeriesTask} is asked to store. */
export interface StoreSeriesPayload {
  anilistId: number;
}

/**
 * How soon a series should be stored. graphile-worker runs lower numbers
 * first, and airing checks run at 0.
 *
 * - `current`: someone is waiting on it, such as a title whose episode just
 *   aired or one a search found but had no time to lay out.
 * - `backfill`: warming the catalog, such as related titles, the release
 *   schedule, and new entries found by discovery. It waits for everything
 *   current, so a large backfill never delays new episodes.
 */
export type SeriesStorePriority = "current" | "backfill";

const seriesStorePriorities: Record<SeriesStorePriority, number> = {
  current: 0,
  backfill: 10
};

/**
 * Queues laying out and storing the series an AniList entry belongs to.
 *
 * A job already waiting for the same entry keeps its place, and keeps its
 * priority when that is higher. A job already running is followed by a new
 * one, so a change made meanwhile is not lost.
 */
export async function scheduleSeriesStore(anilistId: number, priority: SeriesStorePriority) {
  await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${storeSeriesTask},
      payload => json_build_object('anilistId', ${anilistId}::int),
      job_key => ${seriesJobKey(anilistId)},
      job_key_mode => 'preserve_run_at',
      priority => ${keptPriority(anilistId, seriesStorePriorities[priority])}
    )
  `);
}

/**
 * Queues laying out the series of an AniList entry again, if a stored series
 * contains it. Called as the entry airs, so new episodes, and TMDB listing a
 * season it did not list before, reach the stored series. Runs as `current`.
 */
export async function scheduleStoredSeriesRefresh(anilistId: number) {
  await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${storeSeriesTask},
      payload => json_build_object('anilistId', ${anilistId}::int),
      job_key => ${seriesJobKey(anilistId)},
      job_key_mode => 'preserve_run_at',
      priority => ${keptPriority(anilistId, seriesStorePriorities.current)}
    )
    where exists (select 1 from series_entry where anilist_id = ${anilistId})
  `);
}

/** The higher of `priority` and that of a job already waiting for the entry, since replacing a job resets its priority. */
function keptPriority(anilistId: number, priority: number) {
  return sql`least(
    ${priority}::int,
    coalesce(
      (select jobs.priority from graphile_worker.jobs where jobs.key = ${seriesJobKey(anilistId)} and jobs.locked_at is null),
      ${priority}::int
    )
  )`;
}

function seriesJobKey(anilistId: number) {
  return `series:${anilistId}`;
}
