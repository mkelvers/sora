import { run, type Runner } from "graphile-worker";

import { config } from "../config";
import { reviveAiringChecks, trackAiring } from "./airing";
import { trackAiringTask } from "./queue";

const reviveAiringChecksTask = "revive-airing-checks";

/**
 * Starts the background scheduler, which follows every airing anime and
 * stores each new episode once a provider carries it.
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
      [reviveAiringChecksTask]: reviveAiringChecks
    },
    crontab: `0 * * * * ${reviveAiringChecksTask}`
  });
}
