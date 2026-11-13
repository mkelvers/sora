import { inSequence } from "@sora/shared";
import { consoleLogFactory, Logger } from "graphile-worker";
import type { Runner } from "graphile-worker";

import { hasSearchIndex } from "../catalog/queries/search";
import { syncProviderCatalogsTask } from "./jobs/catalogs";
import { syncDubScheduleTask } from "./jobs/dubs";
import { syncSearchIndexTask } from "./jobs/search";
import { syncTimetablesTask } from "./jobs/timetables";

const logger = new Logger(consoleLogFactory).scope({
	label: "first-start",
});

/**
 * What a fresh catalogue needs first: the search index and provider
 * catalogues read whole, and the release timetable. Full syncs, so a sync cut
 * short by a restart starts over instead of only catching up on changes.
 */
const firstJobs: [task: string, payload: Record<string, unknown> | null][] = [
	[
		syncSearchIndexTask,
		{
			full: true,
		},
	],
	[
		syncProviderCatalogsTask,
		{
			full: true,
		},
	],
	[syncTimetablesTask, null],
	[syncDubScheduleTask, null],
];

/**
 * Queues the catalogue upkeep a fresh database needs, once, instead of
 * leaving home, browse, and search empty until each job's minute comes round
 * in the crontab: graphile-worker never fills in runs of a crontab line it
 * has not seen before. The search index's full sync then queues
 * `backfill-series` itself.
 *
 * Does nothing once the search index has finished a full sync, the signal
 * that the catalogue was filled. Until then each start queues them again,
 * but a job still queued or running keeps its key, so none runs twice.
 */
export const fillEmptyCatalog = async (runner: Runner) => {
	if (await hasSearchIndex()) {
		return;
	}

	await inSequence(firstJobs, async ([task, payload]) => {
		await runner.addJob(task, payload, {
			jobKey: `first-start:${task}`,
			jobKeyMode: "unsafe_dedupe",
			priority: -1,
		});
	});
	logger.info(
		`The catalogue was never filled; queued ${firstJobs.map(([task]) => task).join(", ")}`,
	);
};
