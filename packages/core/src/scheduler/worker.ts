import { run } from "graphile-worker";
import type { Task, TaskList } from "graphile-worker";

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
import { pruneDeadJobsJob, pruneDeadJobsTask } from "./jobs/dead-jobs";
import { syncDubSchedule, syncDubScheduleTask } from "./jobs/dubs";
import { storeMissingBackdropEdgesJob, storeMissingBackdropEdgesTask } from "./jobs/edges";
import { lookUpEpisodes } from "./jobs/episodes";
import { storeFeaturedImagesJob, storeFeaturedImagesTask } from "./jobs/featured-images";
import { syncTmdbHintsJob, syncTmdbHintsTask } from "./jobs/hints";
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
	refreshEpisodeListings,
	refreshEpisodeListingsTask,
	storeSeriesJob,
} from "./jobs/series";
import { chooseEpisodeStillsJob, chooseEpisodeStillsTask } from "./jobs/stills";
import { refineSubtitles } from "./jobs/subtitles";
import { syncTimetablesJob, syncTimetablesTask } from "./jobs/timetables";
import { watchPools } from "./pools";
import type { PoolWatch } from "./pools";
import {
	lookUpEpisodesNowTask,
	lookUpEpisodesTask,
	pollAniKotoTask,
	refineSubtitlesTask,
	seriesStorePriority,
	storeSeriesNowTask,
	storeSeriesTask,
	trackAiringTask,
} from "./queue";

/** The running scheduler. */
export interface Scheduler {
	/** Settles once every worker has stopped. */
	promise: Promise<void>;
	stop: () => Promise<void>;
}

/** Tasks for work a viewer is waiting on; see {@link storeSeriesNowTask}. */
const waitedOnTasks: Record<string, Task> = {
	[storeSeriesNowTask]: storeSeriesJob,
	[lookUpEpisodesNowTask]: lookUpEpisodes,
};

/** Runs each task with its AniList requests queued at its job's priority; see {@link aniListPriority}. */
const prioritized = (tasks: Record<string, Task>, pools: PoolWatch): TaskList =>
	Object.fromEntries(
		Object.entries(tasks).map(([name, task]): [string, Task] => [
			name,
			(payload, helpers) => {
				pools.know(helpers.job.locked_by);
				return aniListPriority.run(helpers.job.priority, async () => await task(payload, helpers));
			},
		]),
	);

/**
 * Starts the background scheduler, which follows every airing anime, stores
 * each new episode once a provider carries it, watches AniKoto for new
 * episodes as they air, for dubs as AnimeSchedule expects them, and for the
 * rest every half hour, looks stored titles up on providers,
 * keeps stored series current as seasons air and new ones are announced,
 * mirrors the provider catalogues titles are matched against, keeps the
 * search index current while storing the most popular titles, and this
 * season's and the next's, ahead of any search or browse, keeps the hints that match titles to TMDB current, and warns
 * about providers that stop working, and drops jobs that failed every attempt.
 *
 * Several schedulers may run at once; graphile-worker hands each job to one
 * of them. Stop it with `stop()`; by default it also stops on SIGINT and
 * SIGTERM.
 */
export const startScheduler = async (): Promise<Scheduler> => {
	// Pools that stop without shutting down keep their jobs locked; see watchPools.
	const pools = watchPools();
	const main = await run({
		// Long jobs, such as a full catalogue sync or an airing check waiting
		// out a provider's rate limit, must not take every slot from a layout a
		// viewer is waiting on. AniList's limit is shared by the whole process
		// and serves the most urgent job first, so more slots cost it nothing.
		concurrency: 8,
		connectionString: config.databaseUrl,
		crontab: [
			`0 * * * * ${reviveAiringChecksTask}`,
			`30 4 * * * ${discoverSeriesEntriesTask}`,
			// As far apart as `detailsRunEveryMs` says.
			`*/12 * * * * ${refreshEpisodeDetailsTask}`,
			// Half past, so a run never lands on the hour when most episodes air.
			`30 * * * * ${refreshEpisodeListingsTask}`,
			// Catalogue upkeep runs ahead of queued layouts, which can number in the
			// hundreds; the first run after a start catches up on what changed.
			`15 * * * * ${syncProviderCatalogsTask} ?id=provider-catalogs-changes&fill=1h&priority=-1`,
			`45 3 * * 0 ${syncProviderCatalogsTask} ?id=provider-catalogs-full&fill=1w&priority=-1 {full:true}`,
			`50 4 * * * ${pruneProviderCallsTask} ?priority=-1`,
			`55 4 * * * ${pruneDeadJobsTask} ?priority=-1`,
			`25 * * * * ${checkProviderHealthTask}`,
			`5 * * * * ${syncSearchIndexTask} ?id=search-index-changes&fill=1h&priority=-1`,
			`20 2 * * 1 ${syncSearchIndexTask} ?id=search-index-full&fill=1w&priority=-1 {full:true}`,
			`10,40 * * * * ${backfillSeriesTask} ?priority=-1`,
			`35 5 * * * ${syncTmdbHintsTask} ?id=tmdb-hints&fill=1d&priority=-1`,
			`55 * * * * ${storeMissingBackdropEdgesTask} ?fill=1h&priority=-1`,
			// Often and in a queue of its own: a deploy is caught up within minutes, a run that is still going is never doubled, and one with nothing to do is a single query.
			`*/10 * * * * ${storeFeaturedImagesTask} ?queue=featured-images&priority=-1`,
			`*/5 * * * * ${chooseEpisodeStillsTask} ?priority=-1`,
			`20 * * * * ${syncTimetablesTask} ?id=timetables&fill=1h&priority=-1`,
		].join("\n"),
		taskList: prioritized(
			{
				[trackAiringTask]: trackAiring,
				[reviveAiringChecksTask]: reviveAiringChecks,
				[storeSeriesTask]: storeSeriesJob,
				...waitedOnTasks,
				[discoverSeriesEntriesTask]: discoverSeriesEntries,
				[refreshEpisodeDetailsTask]: refreshEpisodeDetails,
				[refreshEpisodeListingsTask]: refreshEpisodeListings,
				[syncProviderCatalogsTask]: syncProviderCatalogs,
				[pruneProviderCallsTask]: pruneProviderCallsJob,
				[pruneDeadJobsTask]: pruneDeadJobsJob,
				[checkProviderHealthTask]: checkProviderHealthJob,
				[syncSearchIndexTask]: syncSearchIndexJob,
				[backfillSeriesTask]: backfillSeries,
				[syncTmdbHintsTask]: syncTmdbHintsJob,
				[storeMissingBackdropEdgesTask]: storeMissingBackdropEdgesJob,
				[storeFeaturedImagesTask]: storeFeaturedImagesJob,
				[chooseEpisodeStillsTask]: chooseEpisodeStillsJob,
				[syncTimetablesTask]: syncTimetablesJob,
			},
			pools,
		),
	});

	// Every slot above can be held for minutes by jobs waiting their turn on
	// AniList, and a running job is never interrupted, so work a viewer waits
	// on has workers of its own. It still runs ahead of those jobs on AniList.
	// A slot for each title of a search page lets their layouts run at once
	// and share AniList requests, rather than a few at a time each paying
	// their own; they spend most of their time waiting on AniList and TMDB.
	const waitedOn = await run({
		concurrency: 24,
		connectionString: config.databaseUrl,
		// graphile-worker opens connections as jobs need them, up to this.
		maxPoolSize: 24,
		taskList: prioritized(waitedOnTasks, pools),
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
		concurrency: 12,
		connectionString: config.databaseUrl,
		maxPoolSize: 12,
		taskList: {
			[lookUpEpisodesTask]: (payload, helpers) => {
				pools.know(helpers.job.locked_by);
				return aniListPriority.run(
					Math.min(helpers.job.priority, seriesStorePriority("current")),
					async () => await lookUpEpisodes(payload, helpers),
				);
			},
		},
	});

	// New episodes must show up within minutes of AniKoto carrying them, so
	// the looks on AniKoto as they air have workers of their own too. Looks
	// at the same time share one AniKoto request, and the lists they fetch
	// rarely wait on AniList.
	const releases = await run({
		concurrency: 4,
		connectionString: config.databaseUrl,
		crontab: [
			`*/30 * * * * ${watchAniKotoReleasesTask} ?priority=-1`,
			`0 0 * * * ${syncDubScheduleTask} ?id=dub-schedule&fill=1d&priority=-1`,
		].join("\n"),
		maxPoolSize: 4,
		taskList: prioritized(
			{
				[watchAniKotoReleasesTask]: watchAniKotoReleases,
				[pollAniKotoTask]: pollAniKoto,
				[syncDubScheduleTask]: syncDubSchedule,
			},
			pools,
		),
	});

	// Listening to a dub downloads and transcribes a whole episode, which takes
	// minutes of one processor, so one runs at a time and nothing else shares
	// its worker.
	const listening = await run({
		concurrency: 1,
		connectionString: config.databaseUrl,
		maxPoolSize: 2,
		taskList: {
			[refineSubtitlesTask]: (payload, helpers) => {
				pools.know(helpers.job.locked_by);
				return refineSubtitles(payload, helpers);
			},
		},
	});

	return {
		promise: (async () => {
			await Promise.all([
				main.promise,
				waitedOn.promise,
				lookups.promise,
				releases.promise,
				listening.promise,
			]);
			await pools.stop();
		})(),
		stop: async () => {
			await Promise.all([
				main.stop(),
				waitedOn.stop(),
				lookups.stop(),
				releases.stop(),
				listening.stop(),
			]);
			await pools.stop();
		},
	};
};
