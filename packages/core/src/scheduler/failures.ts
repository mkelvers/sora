import { sql } from "drizzle-orm";

import { db } from "../database/client";
import { FailingJobsSchema } from "../models/scheduler";
import type { FailingJobs } from "../models/scheduler";

/**
 * The scheduler's failing jobs per task, by task name; tasks without any are
 * left out. Read from graphile-worker's public `jobs` view.
 *
 * A job counts as given up once it used every attempt and is not running,
 * the same rule `prune-dead-jobs` deletes by: a final attempt in progress
 * has used its attempt already. Error messages are left out; they can quote
 * upstream URLs.
 */
export const getFailingJobs = async (): Promise<FailingJobs[]> => {
	const rows = await db.execute(sql`
    select task_identifier as task,
      count(*) filter (where attempts < max_attempts)::int as retrying,
      count(*) filter (where attempts >= max_attempts)::int as given_up
    from graphile_worker.jobs
    where (attempts < max_attempts and last_error is not null)
      or (attempts >= max_attempts and locked_at is null)
    group by task_identifier
    order by task_identifier
  `);
	return FailingJobsSchema.array().parse(rows);
};
