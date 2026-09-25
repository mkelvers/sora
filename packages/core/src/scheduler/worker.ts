import { run, type Runner } from "graphile-worker";

import { config } from "../config";
import { reviveAiringChecks, trackAiring } from "./airing";
import { checkProviderHealthJob, pruneProviderCallsJob } from "./calls";
import { syncProviderCatalogs } from "./catalogs";
import { backfillSeries, syncSearchIndexJob } from "./search";
import { lookUpEpisodes } from "./episodes";
import { lookUpEpisodesTask, storeSeriesTask, trackAiringTask } from "./queue";
import { discoverSeriesEntries, storeSeriesJob } from "./series";

const reviveAiringChecksTask = "revive-airing-checks";
const discoverSeriesEntriesTask = "discover-series-entries";
const syncProviderCatalogsTask = "sync-provider-catalogs";
const pruneProviderCallsTask = "prune-provider-calls";
const checkProviderHealthTask = "check-provider-health";
const syncSearchIndexTask = "sync-search-index";
const backfillSeriesTask = "backfill-series";

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
    // AniList and provider requests are rate limited per process anyway.
    concurrency: 2,
    taskList: {
      [trackAiringTask]: trackAiring,
      [reviveAiringChecksTask]: reviveAiringChecks,
      [storeSeriesTask]: storeSeriesJob,
      [lookUpEpisodesTask]: lookUpEpisodes,
      [discoverSeriesEntriesTask]: discoverSeriesEntries,
      [syncProviderCatalogsTask]: syncProviderCatalogs,
      [pruneProviderCallsTask]: pruneProviderCallsJob,
      [checkProviderHealthTask]: checkProviderHealthJob,
      [syncSearchIndexTask]: syncSearchIndexJob,
      [backfillSeriesTask]: backfillSeries
    },
    crontab: [
      `0 * * * * ${reviveAiringChecksTask}`,
      `30 4 * * * ${discoverSeriesEntriesTask}`,
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
