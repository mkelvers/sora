import { attempt, day, minute } from "@sora/shared";
import { inArray, lt, sql } from "drizzle-orm";
import { consoleLogFactory, Logger } from "graphile-worker";

import { db } from "../database/client";
import { pool } from "../database/schema/scheduler";

const logger = new Logger(consoleLogFactory).scope({
	label: "pools",
});

/** The pools a scheduler runs, kept alive; see {@link watchPools}. */
export interface PoolWatch {
	/**
	 * Marks the pool that locked a job alive from now on. Each task calls it
	 * with its job's `locked_by`, which graphile-worker sets to the ID of the
	 * pool running it.
	 */
	know: (poolId: string | null | undefined) => void;
	stop: () => Promise<void>;
}

/**
 * Keeps the scheduler's graphile-worker pools marked alive in
 * `scheduler_pool`, and releases the jobs of pools that are not.
 *
 * A pool that stops without a graceful shutdown keeps the jobs it had
 * locked for graphile-worker's four hours. That happens whenever a process
 * dies, and in development each time `bun --watch` restarts the scheduler,
 * which leaves layouts a viewer waits on locked by a pool that is gone.
 *
 * Every {@link heartbeatMs}, each scheduler marks its own pools alive, then
 * releases the jobs locked more than the dead-pool cutoff ago by pools that
 * have not been marked alive that long, whichever scheduler they belonged
 * to. It does so once at start too, so a restart releases what the process
 * it replaces left locked.
 */
export const watchPools = (): PoolWatch => {
	/** How often a scheduler says its pools are alive, and looks for dead ones. */
	const heartbeatMs = 30_000;

	const ours = new Set<string>();

	let running = Promise.resolve();

	const beat = async () => {
		const now = new Date();

		if (ours.size > 0) {
			await db
				.insert(pool)
				.values(
					[...ours].map((id) => ({
						heartbeatAt: now,
						poolId: id,
					})),
				)
				.onConflictDoUpdate({
					set: {
						heartbeatAt: now,
					},
					target: pool.poolId,
				});
		}

		/**
		 * How long a pool may go without a heartbeat before its locked jobs are
		 * released. Several heartbeats, so a busy event loop is not taken for death.
		 */
		const deadAfterMs = 2 * minute;

		// Releases the jobs and queues locked more than `deadAfterMs` before now by
		// pools no heartbeat has marked alive since then.
		const cutoff = new Date(now.getTime() - deadAfterMs);

		const dead = await db.execute<{
			poolId: string;
		}>(sql`
    select distinct jobs.locked_by as "poolId"
    from graphile_worker.jobs
    where jobs.locked_by is not null
      and jobs.locked_at < ${cutoff.toISOString()}::timestamptz
      and not exists (
        select 1 from ${pool}
        where ${pool.poolId} = jobs.locked_by
          and ${pool.heartbeatAt} >= ${cutoff.toISOString()}::timestamptz
      )
  `);

		const deadIds = [...dead].map((row) => row.poolId);

		if (deadIds.length > 0) {
			await db.execute(
				sql`select graphile_worker.force_unlock_workers(array[${sql.join(
					deadIds.map((id) => sql`${id}`),
					sql`, `,
				)}]::text[])`,
			);
			logger.info(
				`Released the jobs of ${deadIds.length} pools that stopped: ${deadIds.join(", ")}`,
			);
		}

		await db.delete(pool).where(lt(pool.heartbeatAt, new Date(now.getTime() - day)));
	};

	const beatAfter = async (previous: Promise<void>) => {
		await previous;
		const { error } = await attempt(beat());

		if (error) {
			let reason = error.message;

			if (error.cause instanceof Error) {
				reason = error.cause.message;
			}

			logger.warn(`Could not mark scheduler pools alive: ${reason}`);
		}
	};

	const tick = () => {
		running = beatAfter(running);
	};

	const timer = setInterval(tick, heartbeatMs);
	tick();

	return {
		know: (id) => {
			if (id && !ours.has(id)) {
				ours.add(id);
				tick();
			}
		},
		stop: async () => {
			clearInterval(timer);
			await running;

			if (ours.size > 0) {
				await db.delete(pool).where(inArray(pool.poolId, [...ours]));
			}
		},
	};
};
