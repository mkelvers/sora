import { run, type Task, type TaskList } from "graphile-worker";

import { aniListPriority } from "../anilist/client";
import { config } from "../config";
import { reviveAiringChecks, reviveAiringChecksTask, trackAiring } from "./jobs/airing";
import {
	checkProviderHealthJob,
	checkProviderHealthTask,
	pruneProviderCallsJob,
	pruneProviderCallsTask,
} from "./jobs/calls";
import { syncProviderCatalogs, syncProviderCatalogsTask } from "./jobs/catalogs";
import { syncDubSchedule, syncDubScheduleTask } from "./jobs/dubs";
import { storeMissingBackdropEdgesJob, storeMissingBackdropEdgesTask } from "./jobs/edges";
import { lookUpEpisodes } from "./jobs/episodes";
import { syncTmdbHintsJob, syncTmdbHintsTask } from "./jobs/hints";
import { recordReleasesJob, recordReleasesTask } from "./jobs/notifications";
import { pollAniKoto, watchAniKotoReleases, watchAniKotoReleasesTask } from "./jobs/releases";
import {
	backfillSeries,
	backfillSeriesTask,
	syncSearchIndexJob,
	syncSearchIndexTask,
} from "./jobs/search";
import {
	discoverSeriesEntries,
	discoverSeriesEntriesTask,
	refreshEpisodeDetails,
	refreshEpisodeDetailsTask,
	storeSeriesJob,
} from "./jobs/series";
import { watchPools } from "./pools";
import {
	lookUpEpisodesNowTask,
	lookUpEpisodesTask,
	pollAniKotoTask,
	seriesStorePriority,
	storeSeriesNowTask,
	storeSeriesTask,
	trackAiringTask,
} from "./queue";

/** The running scheduler. */
export interface Scheduler {
	/** Settles once every worker has stopped. */
	promise: Promise<void>;
	stop(): Promise<void>;
}

/** Tasks for work a viewer is waiting on; see {@link storeSeriesNowTask}. */
const waitedOnTasks: Record<string, Task> = {
	[storeSeriesNowTask]: storeSeriesJob,
	[lookUpEpisodesNowTask]: lookUpEpisodes,
};

/**
 * Starts the background scheduler, which follows every airing anime, stores
 * each new episode once a provider carries it, watches AniKoto for new
 * episodes as they air, for dubs as AnimeSchedule expects them, and for the
 * rest every half hour, records what came out for series in libraries,
 * which notifications are read from, looks stored titles up on providers,
 * keeps stored series current as seasons air and new ones are announced,
 * mirrors the provider catalogues titles are matched against, keeps the
 * search index current while storing the most popular titles, and this
 * season's and the next's, ahead of any search or browse, keeps the hints that match titles to TMDB current, and warns
 * about providers that stop working.
 *
 * Several schedulers may run at once; graphile-worker hands each job to one
 * of them. Stop it with `stop()`; by default it also stops on SIGINT and
 * SIGTERM.
 */
export async function startScheduler(): Promise<Scheduler> {
	// Pools that stop without shutting down keep their jobs locked; see watchPools.
	const pools = watchPools();
	const main = await run({
		events: pools.events,
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
			...waitedOnTasks,
			[discoverSeriesEntriesTask]: discoverSeriesEntries,
			[refreshEpisodeDetailsTask]: refreshEpisodeDetails,
			[syncProviderCatalogsTask]: syncProviderCatalogs,
			[pruneProviderCallsTask]: pruneProviderCallsJob,
			[checkProviderHealthTask]: checkProviderHealthJob,
			[syncSearchIndexTask]: syncSearchIndexJob,
			[backfillSeriesTask]: backfillSeries,
			[syncTmdbHintsTask]: syncTmdbHintsJob,
			[storeMissingBackdropEdgesTask]: storeMissingBackdropEdgesJob,
		}),
		crontab: [
			`0 * * * * ${reviveAiringChecksTask}`,
			`30 4 * * * ${discoverSeriesEntriesTask}`,
			`0 */6 * * * ${refreshEpisodeDetailsTask}`,
			// Catalogue upkeep runs ahead of queued layouts, which can number in the
			// hundreds; the first run after a start catches up on what changed.
			`15 * * * * ${syncProviderCatalogsTask} ?id=provider-catalogs-changes&fill=1h&priority=-1`,
			`45 3 * * 0 ${syncProviderCatalogsTask} ?id=provider-catalogs-full&fill=1w&priority=-1 {full:true}`,
			`50 4 * * * ${pruneProviderCallsTask} ?priority=-1`,
			`25 * * * * ${checkProviderHealthTask}`,
			`5 * * * * ${syncSearchIndexTask} ?id=search-index-changes&fill=1h&priority=-1`,
			`20 2 * * 1 ${syncSearchIndexTask} ?id=search-index-full&fill=1w&priority=-1 {full:true}`,
			`10,40 * * * * ${backfillSeriesTask} ?priority=-1`,
			`35 5 * * * ${syncTmdbHintsTask} ?id=tmdb-hints&fill=1d&priority=-1`,
			`55 * * * * ${storeMissingBackdropEdgesTask} ?fill=1h&priority=-1`,
		].join("\n"),
	});

	// Every slot above can be held for minutes by jobs waiting their turn on
	// AniList, and a running job is never interrupted, so work a viewer waits
	// on has workers of its own. It still runs ahead of those jobs on AniList.
	// A slot for each title of a search page lets their layouts run at once
	// and share AniList requests, rather than a few at a time each paying
	// their own; they spend most of their time waiting on AniList and TMDB.
	const waitedOn = await run({
		events: pools.events,
		connectionString: config.databaseUrl,
		concurrency: 24,
		// graphile-worker opens connections as jobs need them, up to this.
		maxPoolSize: 24,
		taskList: prioritized(waitedOnTasks),
	});

	// Episode lookups ask stream providers, not AniList, so they have workers
	// of their own rather than queueing behind layouts waiting on AniList,
	// which can number in the thousands. Episodes and their languages are
	// unknown until an entry is looked up. A lookup costs AniKoto's API a
	// request or two and spends most of its time waiting on the other sites,
	// so twelve at a time stay well within AniKoto's 60 a minute, and the
	// release watchers wait behind at most a dozen of them.
	//
	// A lookup whose anime is not stored yet loads it from AniList, and those
	// loads share requests, a couple of hundred to each. So they are asked
	// for no later than current layouts, rather than at a backfill lookup's
	// own priority, where they waited behind every layout queued and held up
	// the pool while costing AniList next to nothing.
	const lookups = await run({
		events: pools.events,
		connectionString: config.databaseUrl,
		concurrency: 12,
		maxPoolSize: 12,
		taskList: {
			[lookUpEpisodesTask]: (payload, helpers) =>
				aniListPriority.run(
					Math.min(helpers.job.priority, seriesStorePriority("current")),
					async () => lookUpEpisodes(payload, helpers),
				),
		},
	});

	// New episodes must show up within minutes of AniKoto carrying them, so
	// the looks on AniKoto as they air have workers of their own too. Looks
	// at the same time share one AniKoto request, and the lists they fetch
	// rarely wait on AniList.
	const releases = await run({
		events: pools.events,
		connectionString: config.databaseUrl,
		concurrency: 4,
		maxPoolSize: 4,
		taskList: prioritized({
			[watchAniKotoReleasesTask]: watchAniKotoReleases,
			[pollAniKotoTask]: pollAniKoto,
			[syncDubScheduleTask]: syncDubSchedule,
		}),
		crontab: [
			`*/30 * * * * ${watchAniKotoReleasesTask} ?priority=-1`,
			`0 0 * * * ${syncDubScheduleTask} ?id=dub-schedule&fill=1d&priority=-1`,
		].join("\n"),
	});

	// Notifications read only the database and must follow a release within
	// a minute, so they never wait for a slot behind jobs held up on AniList.
	const notifications = await run({
		events: pools.events,
		connectionString: config.databaseUrl,
		concurrency: 1,
		maxPoolSize: 2,
		taskList: {
			[recordReleasesTask]: recordReleasesJob,
		},
		crontab: `* * * * * ${recordReleasesTask}`,
	});

	return {
		promise: Promise.all([
			main.promise,
			waitedOn.promise,
			lookups.promise,
			releases.promise,
			notifications.promise,
		]).then(() => undefined),
		stop: async () => {
			await Promise.all([
				main.stop(),
				waitedOn.stop(),
				lookups.stop(),
				releases.stop(),
				notifications.stop(),
			]);
			await pools.stop();
		},
	};
}

/** Runs each task with its AniList requests queued at its job's priority; see {@link aniListPriority}. */
function prioritized(tasks: Record<string, Task>): TaskList {
	return Object.fromEntries(
		Object.entries(tasks).map(([name, task]): [string, Task] => [
			name,
			(payload, helpers) =>
				aniListPriority.run(helpers.job.priority, async () => task(payload, helpers)),
		]),
	);
}
