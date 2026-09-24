import { run, type Runner } from "graphile-worker";

import { config } from "../config";
import { reviveAiringChecks, trackAiring } from "./airing";
import { lookUpEpisodes } from "./episodes";
import { lookUpEpisodesTask, storeSeriesTask, trackAiringTask } from "./queue";
import { discoverSeriesEntries, storeSeriesJob } from "./series";

const reviveAiringChecksTask = "revive-airing-checks";
const discoverSeriesEntriesTask = "discover-series-entries";

/**
 * Starts the background scheduler, which follows every airing anime, stores
 * each new episode once a provider carries it, looks stored titles up on
 * providers, and keeps stored series current as seasons air and new ones
 * are announced.
 *
 * Several schedulers may run at once; graphile-worker hands each job to one
 * of them. Stop it with `runner.stop()`; by default it also stops on SIGINT
 * and SIGTERM.
 */
export async function startScheduler(): Promise<Runner> {
  return run({
    connectionString: config.databaseUrl,
    // AniList and provider requests are rate limited per process anyway.
    concurrency: 2,
    taskList: {
      [trackAiringTask]: trackAiring,
      [reviveAiringChecksTask]: reviveAiringChecks,
      [storeSeriesTask]: storeSeriesJob,
      [lookUpEpisodesTask]: lookUpEpisodes,
      [discoverSeriesEntriesTask]: discoverSeriesEntries
    },
    crontab: [
      `0 * * * * ${reviveAiringChecksTask}`,
      `30 4 * * * ${discoverSeriesEntriesTask}`
    ].join("\n")
  });
}
