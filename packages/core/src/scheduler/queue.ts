import { sql, type SQL } from "drizzle-orm";

import { viewerWaitingPriority } from "../anilist/client";
import { db } from "../database/client";

/** The graphile-worker task that follows one anime while it airs. */
export const trackAiringTask = "track-airing";

/**
 * The priority of every airing check. graphile-worker runs lower numbers
 * first, so a due check runs ahead of any queued series layout, however long
 * that queue grows; otherwise a new episode waits behind hundreds of layouts.
 * It is also written in SQL by `reviveAiringChecks`.
 */
export const airingCheckPriority = -1;

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
      job_key_mode => 'replace',
      priority => ${airingCheckPriority}::int
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
      job_key_mode => 'unsafe_dedupe',
      priority => ${airingCheckPriority}::int
    )
  `);
}

/** The graphile-worker task that watches AniKoto for one aired episode. */
export const pollAniKotoTask = "poll-anikoto";

/** Where watching AniKoto for an aired episode left off; see {@link pollAniKotoTask}. */
export interface PollAniKotoPayload {
  anilistId: number;
  /** The aired episode AniKoto does not carry yet. */
  episode: number;
  /** How many looks have already not found it. */
  attempt: number;
}

/**
 * Schedules the next look on AniKoto for an aired episode, replacing any
 * pending one for the anime. Runs at {@link airingCheckPriority}, since a
 * viewer may be waiting on the episode.
 */
export async function scheduleAniKotoPoll(payload: PollAniKotoPayload, runAt: Date) {
  await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${pollAniKotoTask},
      payload => json_build_object(
        'anilistId', ${payload.anilistId}::int,
        'episode', ${payload.episode}::float8,
        'attempt', ${payload.attempt}::int
      ),
      run_at => ${runAt.toISOString()}::timestamptz,
      job_key => ${`anikoto-poll:${payload.anilistId}`},
      job_key_mode => 'replace',
      priority => ${airingCheckPriority}::int
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

/**
 * {@link storeSeriesTask} for a series a viewer is waiting on. Its own task
 * name lets a pool of workers that runs nothing else pick it up at once,
 * rather than after a slot among long catalogue jobs frees up; see
 * {@link startScheduler}.
 */
export const storeSeriesNowTask = "store-series-now";

/** What {@link storeSeriesTask} is asked to store. */
export interface StoreSeriesPayload {
  anilistId: number;
}

/**
 * How soon a series should be stored. graphile-worker runs lower numbers
 * first.
 *
 * - `waiting`: a viewer is waiting on it, such as a title a search found or
 *   a season whose episodes are open. Requests only read the database, so
 *   this runs ahead of everything else, airing checks and catalogue upkeep
 *   included; there are only ever a few such jobs.
 * - `current`: it changed just now, such as a title whose episode just
 *   aired. Airing checks, at {@link airingCheckPriority}, run ahead of it.
 * - `backfill`: warming the catalog, such as related titles, the release
 *   schedule, and new entries found by discovery. It waits for everything
 *   current, so a large backfill never delays new episodes.
 */
export type SeriesStorePriority = "waiting" | "current" | "backfill";

const seriesStorePriorities: Record<SeriesStorePriority, number> = {
  waiting: viewerWaitingPriority,
  current: 0,
  backfill: 10
};

/**
 * Places among a viewer's results told apart by priority when `waiting`:
 * the first runs most urgently, the last of them at `waiting` itself.
 */
const rankedPlaces = 6;

/**
 * The graphile-worker priority of a series layout: see
 * {@link SeriesStorePriority}, with `waiting` ones told apart by `rank`
 * (see {@link scheduleSeriesStore}). Every `waiting` priority stays at or
 * below `waiting`, so it keeps the workers and AniList requests kept for
 * viewers.
 */
export function seriesStorePriority(priority: SeriesStorePriority, rank = rankedPlaces - 1) {
  const urgency = priority === "waiting" ? Math.min(rankedPlaces - 1, Math.max(0, rankedPlaces - 1 - rank)) : 0;
  return seriesStorePriorities[priority] - urgency;
}

/**
 * Queues laying out and storing the series an AniList entry belongs to.
 *
 * A job already waiting for the same entry keeps its place, and keeps its
 * priority when that is higher. A job already running is followed by a new
 * one, so a change made meanwhile is not lost.
 *
 * @param rank - Where a `waiting` entry is among the results the viewer
 *   waits on, from 0. Higher places run first, so a search for one title
 *   lays that title out before the looser matches it also found, which
 *   share AniList's limited requests.
 */
export async function scheduleSeriesStore(anilistId: number, priority: SeriesStorePriority, rank?: number) {
  const kept = keptPriority(seriesJobKey(anilistId), seriesStorePriority(priority, rank));
  await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${taskAt(kept, storeSeriesTask, storeSeriesNowTask)},
      payload => json_build_object('anilistId', ${anilistId}::int),
      job_key => ${seriesJobKey(anilistId)},
      job_key_mode => 'preserve_run_at',
      priority => ${kept}
    )
  `);
}

/**
 * Queues laying out the series of an AniList entry again, if a stored series
 * contains it. Called as the entry airs, so new episodes, and TMDB listing a
 * season it did not list before, reach the stored series, and when what the
 * layout is derived from changed.
 */
export async function scheduleStoredSeriesRefresh(anilistId: number, priority: Exclude<SeriesStorePriority, "waiting"> = "current") {
  const kept = keptPriority(seriesJobKey(anilistId), seriesStorePriorities[priority]);
  await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${taskAt(kept, storeSeriesTask, storeSeriesNowTask)},
      payload => json_build_object('anilistId', ${anilistId}::int),
      job_key => ${seriesJobKey(anilistId)},
      job_key_mode => 'preserve_run_at',
      priority => ${kept}
    )
    where exists (select 1 from series_entry where anilist_id = ${anilistId})
  `);
}

/** The higher of `priority` and that of a job already waiting under `jobKey`, since replacing a job resets its priority. */
function keptPriority(jobKey: string, priority: number) {
  return sql`least(
    ${priority}::int,
    coalesce(
      (select jobs.priority from graphile_worker.jobs where jobs.key = ${jobKey} and jobs.locked_at is null),
      ${priority}::int
    )
  )`;
}

/**
 * The task a job runs as at `priority`: `waitedOn` when a viewer is waiting
 * on it, so a job raised to `waiting` moves to the workers kept free for
 * such jobs, and one already there stays when it is queued again at a lower
 * priority, since it keeps its priority too.
 */
function taskAt(priority: SQL, task: string, waitedOn: string) {
  return sql`case when ${priority} <= ${seriesStorePriorities.waiting}::int then ${waitedOn} else ${task} end`;
}

function seriesJobKey(anilistId: number) {
  return `series:${anilistId}`;
}

/** The graphile-worker task that looks one AniList entry up on every stream provider. */
export const lookUpEpisodesTask = "look-up-episodes";

/** {@link lookUpEpisodesTask} for episodes a viewer is waiting on; see {@link storeSeriesNowTask}. */
export const lookUpEpisodesNowTask = "look-up-episodes-now";

/** What {@link lookUpEpisodesTask} is asked to look up. */
export interface LookUpEpisodesPayload {
  anilistId: number;
}

/**
 * Queues looking an AniList entry up on every stream provider and storing
 * their episode lists, so episode listings can be read from the database.
 *
 * A job already waiting for the same entry keeps its place, and keeps its
 * priority when that is higher. Priorities are those of
 * {@link scheduleSeriesStore}: `waiting` when someone is viewing the entry's
 * episodes, `backfill` when its series was just stored.
 */
export async function scheduleEpisodeLookup(anilistId: number, priority: SeriesStorePriority) {
  const jobKey = `episodes:${anilistId}`;
  const kept = keptPriority(jobKey, seriesStorePriorities[priority]);
  await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${taskAt(kept, lookUpEpisodesTask, lookUpEpisodesNowTask)},
      payload => json_build_object('anilistId', ${anilistId}::int),
      job_key => ${jobKey},
      job_key_mode => 'preserve_run_at',
      priority => ${kept}
    )
  `);
}
