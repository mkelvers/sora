import { pgTable, text } from "drizzle-orm/pg-core";

import { timestamptz } from "./columns";

/**
 * The graphile-worker pools of every running scheduler, and when each last
 * said it is alive. A pool that stops saying so, as when the process dies or
 * `bun --watch` restarts it without a graceful shutdown, holds its locked
 * jobs until someone releases them; see `releaseDeadPools`.
 *
 * Rows of pools that stopped are pruned once they are a day old.
 */
export const schedulerPool = pgTable("scheduler_pool", {
	/** graphile-worker's ID for the pool, such as `pool-8fbf68f75db1169558`, as jobs' `locked_by` names it. */
	poolId: text("pool_id").primaryKey(),
	heartbeatAt: timestamptz("heartbeat_at").notNull(),
});
