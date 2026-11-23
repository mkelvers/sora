import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { viewerWaitingPriority } from "../anilist/client";

/** The graphile-worker priority a job is queued at, in SQL. */
export class JobPriority {
	readonly #priority: SQL;

	constructor(priority: SQL) {
		this.#priority = priority;
	}

	/** The higher of `priority` and that of a job already waiting under `jobKey`, since replacing a job resets its priority. */
	static kept(jobKey: string | SQL, priority: number): JobPriority {
		return new JobPriority(sql`least(
    ${priority}::int,
    coalesce(
      (select jobs.priority from graphile_worker.jobs where jobs.key = ${jobKey} and jobs.locked_at is null),
      ${priority}::int
    )
  )`);
	}

	get sql(): SQL {
		return this.#priority;
	}

	/**
	 * The task a job runs as at this priority: `waitedOn` when a viewer is
	 * waiting on it, so a job raised to `waiting` moves to the workers kept
	 * free for such jobs, and one already there stays when it is queued again
	 * at a lower priority, since it keeps its priority too.
	 */
	task(task: string, waitedOn: string): SQL {
		return sql`case when ${this.#priority} <= ${viewerWaitingPriority}::int then ${waitedOn} else ${task} end`;
	}
}
