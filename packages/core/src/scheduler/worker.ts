import { run } from "graphile-worker";
import type { Task } from "graphile-worker";

import { aniListPriority } from "../anilist/client";
import { config } from "../config";
import { upscales } from "../series/upscale";
import { fillEmptyCatalog } from "./first-start";
import { reviveChecks, reviveChecksTask, track } from "./jobs/airing";
import { checkHealth, healthTask, pruneLog, pruneLogTask } from "./jobs/calls";
import { syncProviders, syncProvidersTask } from "./jobs/catalogs";
import { pruneDead, pruneDeadTask } from "./jobs/dead-jobs";
import { refreshStale, refreshStaleTask, storeFacts, storeFactsTask } from "./jobs/details";
import { syncSchedule, syncScheduleTask } from "./jobs/dubs";
import { storeMissing, storeMissingTask } from "./jobs/edges";
import { lookUp } from "./jobs/episodes";
import { storeImages, storeImagesTask } from "./jobs/featured-images";
import { syncTmdb, syncTmdbTask } from "./jobs/hints";
import { pollAniKoto, watchAnikoto, watchAnikotoTask } from "./jobs/releases";
import { backfillSeries, backfillSeriesTask, syncIndex, syncIndexTask } from "./jobs/search";
import {
	discoverEntries,
	discoverEntriesTask,
	refreshEpisodeDetails,
	refreshDetailsTask,
	refreshEpisodeListings,
	refreshListingsTask,
	storeEntry,
} from "./jobs/series";
import { detectSegments } from "./jobs/skips";
import { chooseFrames, chooseFramesTask } from "./jobs/stills";
import { probeLanguages, refineCues } from "./jobs/subtitles";
import { syncWeeks, syncWeeksTask } from "./jobs/timetables";
import { storeActivity, storeActivityTask } from "./jobs/trends";
import { enlargeBackdrop } from "./jobs/upscale";
import { failInvalid } from "./payload";
import { pools } from "./pools";
import type { PoolWatch } from "./pools";
import {
	detectSegmentsTask,
	lookupNowTask,
	lookupEpisodesTask,
	pollAnikotoTask,
	probeSubtitlesTask,
	refineSubtitlesTask,
	seriesStorePriority,
	storeNowTask,
	storeSeriesTask,
	trackAiringTask,
	upscaleBackdropTask,
} from "./queue";

/** The running scheduler. */
export interface Scheduler {
	/** Settles once every worker has stopped. */
	promise: Promise<void>;
	stop: () => Promise<void>;
}

/** Tasks for work a viewer is waiting on; see {@link storeNowTask}. */
const waitedOnTasks = {
	[storeNowTask]: storeEntry,
	[lookupNowTask]: lookUp,
} satisfies Record<string, Task>;

/** Wraps a scheduler's tasks so each job marks its pool alive as it starts. */
class Prioritizer {
	readonly #pools: PoolWatch;

	constructor(watched: PoolWatch) {
		this.#pools = watched;
	}

	/** Runs each task with its AniList requests queued at its job's priority; see {@link aniListPriority}. */
	tasks(tasks: Record<string, Task>): Record<string, Task> {
		return Object.fromEntries(
			Object.entries(tasks).map(([name, task]): [string, Task] => [
				name,
				(payload, helpers) => {
					this.#pools.know(helpers.job.locked_by);

					return aniListPriority.run(
						helpers.job.priority,
						async () => await task(payload, helpers),
					);
				},
			]),
		);
	}
}

export const scheduler = {
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
	 * On a fresh database it first queues what fills the catalogue; see
	 * {@link fillEmptyCatalog}.
	 *
	 * Several schedulers may run at once; graphile-worker hands each job to one
	 * of them. Stop it with `stop()`; by default it also stops on SIGINT and
	 * SIGTERM.
	 */
	async start(): Promise<Scheduler> {
		// Pools that stop without shutting down keep their jobs locked; see pools.watch.
		const watched = pools.watch();
		const prioritizer = new Prioritizer(watched);

		const main = await run({
			// Long jobs, such as a full catalogue sync or an airing check waiting
			// out a provider's rate limit, must not take every slot from a layout a
			// viewer is waiting on. AniList's limit is shared by the whole process
			// and serves the most urgent job first, so more slots cost it nothing.
			concurrency: 8,
			connectionString: config.databaseUrl,
			crontab: [
				`0 * * * * ${reviveChecksTask}`,
				`30 4 * * * ${discoverEntriesTask}`,
				// As far apart as `runEveryMs` says.
				`*/12 * * * * ${refreshDetailsTask}`,
				// Half past, so a run never lands on the hour when most episodes air.
				`30 * * * * ${refreshListingsTask}`,
				// Catalogue upkeep runs ahead of queued layouts, which can number in the
				// hundreds; the first run after a start catches up on what changed.
				`15 * * * * ${syncProvidersTask} ?id=provider-catalogs-changes&fill=1h&priority=-1`,
				`45 3 * * 0 ${syncProvidersTask} ?id=provider-catalogs-full&fill=1w&priority=-1 {full:true}`,
				`50 4 * * * ${pruneLogTask} ?priority=-1`,
				`55 4 * * * ${pruneDeadTask} ?priority=-1`,
				`25 * * * * ${healthTask}`,
				`5 * * * * ${syncIndexTask} ?id=search-index-changes&fill=1h&priority=-1`,
				`20 2 * * 1 ${syncIndexTask} ?id=search-index-full&fill=1w&priority=-1 {full:true}`,
				`10,40 * * * * ${backfillSeriesTask} ?priority=-1`,
				`35 5 * * * ${syncTmdbTask} ?id=tmdb-hints&fill=1d&priority=-1`,
				`55 * * * * ${storeMissingTask} ?fill=1h&priority=-1`,
				`40 * * * * ${storeImagesTask} ?priority=-1`,
				`*/5 * * * * ${chooseFramesTask} ?priority=-1`,
				`20 * * * * ${syncWeeksTask} ?id=timetables&fill=1h&priority=-1`,
				// Before the featured titles change at 06:00 UTC.
				`30 5 * * * ${storeActivityTask} ?id=anime-trends&fill=1d&priority=-1`,
				// Five AniList requests a run until every stored anime has been fetched
				// with the fields added last, then none.
				`*/10 * * * * ${refreshStaleTask} ?priority=5`,
				`50 * * * * ${storeFactsTask} ?priority=5`,
			].join("\n"),
			taskList: failInvalid(
				prioritizer.tasks({
					[trackAiringTask]: track,
					[reviveChecksTask]: reviveChecks,
					[storeSeriesTask]: storeEntry,
					...waitedOnTasks,
					[discoverEntriesTask]: discoverEntries,
					[refreshDetailsTask]: refreshEpisodeDetails,
					[refreshListingsTask]: refreshEpisodeListings,
					[syncProvidersTask]: syncProviders,
					[pruneLogTask]: pruneLog,
					[pruneDeadTask]: pruneDead,
					[healthTask]: checkHealth,
					[syncIndexTask]: syncIndex,
					[backfillSeriesTask]: backfillSeries,
					[syncTmdbTask]: syncTmdb,
					[storeMissingTask]: storeMissing,
					[storeImagesTask]: storeImages,
					[chooseFramesTask]: chooseFrames,
					[syncWeeksTask]: syncWeeks,
					[storeActivityTask]: storeActivity,
					[refreshStaleTask]: refreshStale,
					[storeFactsTask]: storeFacts,
				}),
			),
		});

		await fillEmptyCatalog(main);

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
			taskList: failInvalid(prioritizer.tasks(waitedOnTasks)),
		});

		// Episode lookups ask stream providers, not AniList, so they have workers
		// of their own rather than queueing behind layouts waiting on AniList,
		// which can number in the thousands. Episodes and their languages are
		// unknown until an entry is looked up. A lookup costs AniKoto's API a
		// request or two and spends most of its time waiting on the other sites,
		// so twelve at a time stay within AniKoto's 24 a minute, and the
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
			taskList: failInvalid({
				[lookupEpisodesTask]: (payload, helpers) => {
					watched.know(helpers.job.locked_by);

					return aniListPriority.run(
						Math.min(helpers.job.priority, seriesStorePriority("current")),
						async () => await lookUp(payload, helpers),
					);
				},
				// Asks the same sites as playback does, once per series, behind lookups.
				[probeSubtitlesTask]: (payload, helpers) => {
					watched.know(helpers.job.locked_by);

					return probeLanguages(payload, helpers);
				},
			}),
		});

		// New episodes must show up within minutes of AniKoto carrying them, so
		// the looks on AniKoto as they air have workers of their own too. Looks
		// at the same time share one AniKoto request, and the lists they fetch
		// rarely wait on AniList.
		const releases = await run({
			concurrency: 4,
			connectionString: config.databaseUrl,
			crontab: [
				`*/30 * * * * ${watchAnikotoTask} ?priority=-1`,
				`0 0 * * * ${syncScheduleTask} ?id=dub-schedule&fill=1d&priority=-1`,
			].join("\n"),
			maxPoolSize: 4,
			taskList: failInvalid(
				prioritizer.tasks({
					[watchAnikotoTask]: watchAnikoto,
					[pollAnikotoTask]: pollAniKoto,
					[syncScheduleTask]: syncSchedule,
				}),
			),
		});

		// Listening to a dub downloads and transcribes a whole episode, which takes
		// minutes of one processor, so one runs at a time and nothing else shares
		// its worker.
		const listening = await run({
			concurrency: 1,
			connectionString: config.databaseUrl,
			maxPoolSize: 2,
			taskList: failInvalid({
				[refineSubtitlesTask]: (payload, helpers) => {
					watched.know(helpers.job.locked_by);

					return refineCues(payload, helpers);
				},
			}),
		});

		// Looking for an episode's theme songs reads several minutes of each of
		// its videos, so one runs at a time, in a worker of its own, and never
		// holds up dub listening or catalogue work.
		const detecting = await run({
			concurrency: 1,
			connectionString: config.databaseUrl,
			maxPoolSize: 2,
			taskList: failInvalid({
				[detectSegmentsTask]: (payload, helpers) => {
					watched.know(helpers.job.locked_by);

					return detectSegments(payload, helpers);
				},
			}),
		});

		// Upscaling a backdrop keeps a processor busy for minutes, so one runs at
		// a time, in a worker of its own.
		const upscaling = await run({
			concurrency: 1,
			connectionString: config.databaseUrl,
			maxPoolSize: 2,
			taskList: failInvalid({
				[upscaleBackdropTask]: (payload, helpers) => {
					watched.know(helpers.job.locked_by);

					return enlargeBackdrop(payload, helpers);
				},
			}),
		});

		await upscales.remakeOutdated();

		return {
			promise: (async () => {
				await Promise.all([
					main.promise,
					waitedOn.promise,
					lookups.promise,
					releases.promise,
					listening.promise,
					detecting.promise,
					upscaling.promise,
				]);
				await watched.stop();
			})(),
			stop: async () => {
				await Promise.all([
					main.stop(),
					waitedOn.stop(),
					lookups.stop(),
					releases.stop(),
					listening.stop(),
					detecting.stop(),
					upscaling.stop(),
				]);
				await watched.stop();
			},
		};
	},
};
