import { run, type Runner } from "graphile-worker";

import { config } from "../config";
import { reviveAiringChecks, trackAiring } from "./airing";
import { syncAniKotoCatalogJob } from "./anikoto";
import { backfillSeries, syncSearchIndexJob } from "./search";
import { lookUpEpisodes } from "./episodes";
import { lookUpEpisodesTask, storeSeriesTask, trackAiringTask } from "./queue";
import { discoverSeriesEntries, storeSeriesJob } from "./series";

const reviveAiringChecksTask = "revive-airing-checks";
const discoverSeriesEntriesTask = "discover-series-entries";
const syncAniKotoCatalogTask = "sync-anikoto-catalog";
const syncSearchIndexTask = "sync-search-index";
const backfillSeriesTask = "backfill-series";

/**
 * Starts the background scheduler, which follows every airing anime, stores
 * each new episode once a provider carries it, looks stored titles up on
 * providers, keeps stored series current as seasons air and new ones are
 * announced, mirrors AniKoto's catalogue to match titles against, and keeps
 * the search index current while storing the most popular titles ahead of
 * any search.
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
      [syncAniKotoCatalogTask]: syncAniKotoCatalogJob,
      [syncSearchIndexTask]: syncSearchIndexJob,
      [backfillSeriesTask]: backfillSeries
    },
    crontab: [
      `0 * * * * ${reviveAiringChecksTask}`,
      `30 4 * * * ${discoverSeriesEntriesTask}`,
      // Catalogue upkeep runs ahead of queued layouts, which can number in the
      // hundreds; the first run after a start catches up on what changed.
      `15 * * * * ${syncAniKotoCatalogTask} ?id=anikoto-catalog-changes&fill=1h&priority=-1`,
      `45 3 * * 0 ${syncAniKotoCatalogTask} ?id=anikoto-catalog-full&fill=1w&priority=-1 {full:true}`,
      `5 * * * * ${syncSearchIndexTask} ?id=search-index-changes&fill=1h&priority=-1`,
      `20 2 * * 1 ${syncSearchIndexTask} ?id=search-index-full&fill=1w&priority=-1 {full:true}`,
      `10,40 * * * * ${backfillSeriesTask} ?priority=-1`
    ].join("\n")
  });
}
