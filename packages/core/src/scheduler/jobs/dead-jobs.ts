import { sql } from "drizzle-orm";
import { makeWorkerUtils, type Task } from "graphile-worker";

import { config } from "../../config";
import { db } from "../../database/client";

/** The graphile-worker task that drops jobs that will never run again. */
export const pruneDeadJobsTask = "prune-dead-jobs";

/**
 * Logs and deletes the jobs that failed every attempt. graphile-worker keeps
 * them for good, and they are never retried: a task that keeps something
 * current queues itself again, or is queued again by the job that revives
 * it (such as `reviveAiringChecks`). Left in place they only pile up, and
 * thousands of them hide the queue's real work. What failed, and why, is
 * logged first, one line per task and error. Runs daily.
 */
export const pruneDeadJobsJob: Task = async (_payload, helpers) => {
	const dead = await db.execute<{
		task_identifier: string;
		last_error: string | null;
		count: number;
	}>(sql`
    select task_identifier, split_part(last_error, E'\n', 1) as last_error, count(*)::int as count
    from graphile_worker.jobs
    where attempts >= max_attempts
      and locked_at is null
    group by 1, 2
    order by 3 desc
  `);
	if (dead.length === 0) {
		return;
	}

	for (const { task_identifier, last_error, count } of dead) {
		helpers.logger.warn(
			`${count} ${task_identifier} jobs failed every attempt; last error: ${last_error ?? "none"}`,
		);
	}

	const utils = await makeWorkerUtils({
		connectionString: config.databaseUrl,
	});
	try {
		await utils.cleanup({
			tasks: ["DELETE_PERMAFAILED_JOBS", "GC_JOB_QUEUES"],
		});
	} finally {
		await utils.release();
	}
};
