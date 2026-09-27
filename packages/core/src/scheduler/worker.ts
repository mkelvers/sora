import { run, type Runner, type Task, type TaskList } from "graphile-worker";

import { withAniListPriority } from "../anilist/client";
import { config } from "../config";
import { reviveAiringChecks, reviveAiringChecksTask, trackAiring } from "./jobs/airing";
import {
  checkProviderHealthJob,
  checkProviderHealthTask,
  pruneProviderCallsJob,
  pruneProviderCallsTask
} from "./jobs/calls";
import { syncProviderCatalogs, syncProviderCatalogsTask } from "./jobs/catalogs";
import { lookUpEpisodes } from "./jobs/episodes";
import { backfillSeries, backfillSeriesTask, syncSearchIndexJob, syncSearchIndexTask } from "./jobs/search";
import {
  discoverSeriesEntries,
  discoverSeriesEntriesTask,
  refreshEpisodeDetails,
  refreshEpisodeDetailsTask,
  storeSeriesJob
} from "./jobs/series";
import { lookUpEpisodesTask, storeSeriesTask, trackAiringTask } from "./queue";

/**
 * Starts the background scheduler, which follows every airing anime, stores
 * each new episode once a provider carries it, looks stored titles up on
 * providers, keeps stored series current as seasons air and new ones are
 * announced, mirrors the provider catalogues titles are matched against,
 * keeps the search index current while storing the most popular titles ahead
 * of any search, and warns about providers that stop working.
 *
 * Several schedulers may run at once; graphile-worker hands each job to one
 * of them. Stop it with `runner.stop()`; by default it also stops on SIGINT
 * and SIGTERM.
 */
export async function startScheduler(): Promise<Runner> {
  return run({
    connectionString: config.databaseUrl,
    // Long jobs, such as a full catalogue sync or an airing check waiting
    // out a provider's rate limit, must not take every slot from a layout a
    // viewer is waiting on. AniList's limit is shared by the whole process
    // and serves the most urgent job first, so more slots cost it nothing.
    concurrency: 8,
    taskList: prioritized({
      [trackAiringTask]: trackAiring,
      [reviveAiringChecksTask]: reviveAiringChecks,
      [storeSeriesTask]: storeSeriesJob,
      [lookUpEpisodesTask]: lookUpEpisodes,
      [discoverSeriesEntriesTask]: discoverSeriesEntries,
      [refreshEpisodeDetailsTask]: refreshEpisodeDetails,
      [syncProviderCatalogsTask]: syncProviderCatalogs,
      [pruneProviderCallsTask]: pruneProviderCallsJob,
      [checkProviderHealthTask]: checkProviderHealthJob,
      [syncSearchIndexTask]: syncSearchIndexJob,
      [backfillSeriesTask]: backfillSeries
    }),
    crontab: [
      `0 * * * * ${reviveAiringChecksTask}`,
      `30 4 * * * ${discoverSeriesEntriesTask}`,
      `0 6 * * * ${refreshEpisodeDetailsTask}`,
      // Catalogue upkeep runs ahead of queued layouts, which can number in the
      // hundreds; the first run after a start catches up on what changed.
      `15 * * * * ${syncProviderCatalogsTask} ?id=provider-catalogs-changes&fill=1h&priority=-1`,
      `45 3 * * 0 ${syncProviderCatalogsTask} ?id=provider-catalogs-full&fill=1w&priority=-1 {full:true}`,
      `50 4 * * * ${pruneProviderCallsTask} ?priority=-1`,
      `25 * * * * ${checkProviderHealthTask}`,
      `5 * * * * ${syncSearchIndexTask} ?id=search-index-changes&fill=1h&priority=-1`,
      `20 2 * * 1 ${syncSearchIndexTask} ?id=search-index-full&fill=1w&priority=-1 {full:true}`,
      `10,40 * * * * ${backfillSeriesTask} ?priority=-1`
    ].join("\n")
  });
}

/** Runs each task with its AniList requests queued at its job's priority; see {@link withAniListPriority}. */
function prioritized(tasks: Record<string, Task>): TaskList {
  return Object.fromEntries(
    Object.entries(tasks).map(([name, task]): [string, Task] => [
      name,
      (payload, helpers) => withAniListPriority(helpers.job.priority, async () => task(payload, helpers))
    ])
  );
}
