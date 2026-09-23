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
 * Queues laying out and storing the series an AniList entry belongs to.
 *
 * A job already waiting for the same entry keeps its place. A job already
 * running is followed by a new one, so a change made meanwhile is not lost.
 */
export async function scheduleSeriesStore(anilistId: number) {
  await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${storeSeriesTask},
      payload => json_build_object('anilistId', ${anilistId}::int),
      job_key => ${seriesJobKey(anilistId)},
      job_key_mode => 'preserve_run_at'
    )
  `);
}

/**
 * Queues laying out the series of an AniList entry again, if a stored series
 * contains it. Called as the entry airs, so new episodes, and TMDB listing a
 * season it did not list before, reach the stored series.
 */
export async function scheduleStoredSeriesRefresh(anilistId: number) {
  await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${storeSeriesTask},
      payload => json_build_object('anilistId', ${anilistId}::int),
      job_key => ${seriesJobKey(anilistId)},
      job_key_mode => 'preserve_run_at'
    )
    where exists (select 1 from series_entry where anilist_id = ${anilistId})
  `);
}

function seriesJobKey(anilistId: number) {
  return `series:${anilistId}`;
}
