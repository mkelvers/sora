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
