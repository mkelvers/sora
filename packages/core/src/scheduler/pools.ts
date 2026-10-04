import { EventEmitter } from "node:events";

import { attempt } from "@sora/attempt";
import { inArray, lt, sql } from "drizzle-orm";
import { consoleLogFactory, Logger, type WorkerEvents } from "graphile-worker";

import { db } from "../database/client";
import { schedulerPool } from "../database/schema";
import { day, minute } from "../time";

const logger = new Logger(consoleLogFactory).scope({
	label: "pools",
});

/** How often a scheduler says its pools are alive, and looks for dead ones. */
const heartbeatMs = 30_000;

/**
 * How long a pool may go without a heartbeat before its locked jobs are
 * released. Several heartbeats, so a busy event loop is not taken for death.
 */
const deadAfterMs = 2 * minute;

/** The pools a scheduler runs, kept alive; see {@link watchPools}. */
export interface PoolWatch {
	/** Passed to each of the scheduler's `run()` calls, so its pools are known. */
	events: WorkerEvents;
	stop(): Promise<void>;
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
 * releases the jobs locked more than {@link deadAfterMs} ago by pools that
 * have not been marked alive that long, whichever scheduler they belonged
 * to. It does so once at start too, so a restart releases what the process
 * it replaces left locked.
 */
export function watchPools(): PoolWatch {
	const events: WorkerEvents = new EventEmitter();
	const poolIds = new Set<string>();
	events.on("pool:create", ({ workerPool }) => {
		poolIds.add(workerPool.id);
	});
	events.on("pool:release", ({ workerPool }) => {
		poolIds.delete(workerPool.id);
	});

	let running = Promise.resolve();
	const tick = () => {
		running = running.then(async () => {
			const { error } = await attempt(beat);
			if (error) {
				logger.warn(`Could not mark scheduler pools alive: ${error.message}`);
			}
		});
	};

	const beat = async () => {
		const now = new Date();
		if (poolIds.size > 0) {
			await db
				.insert(schedulerPool)
				.values(
					[...poolIds].map((poolId) => ({
						poolId,
						heartbeatAt: now,
					})),
				)
				.onConflictDoUpdate({
					target: schedulerPool.poolId,
					set: {
						heartbeatAt: now,
					},
				});
		}

		await releaseDeadPools(now);
		await db
			.delete(schedulerPool)
			.where(lt(schedulerPool.heartbeatAt, new Date(now.getTime() - day)));
	};

	const timer = setInterval(tick, heartbeatMs);
	// Pools are created as `run()` resolves; give them a moment to be known first.
	setTimeout(tick, 1_000);

	return {
		events,
		stop: async () => {
			clearInterval(timer);
			await running;
			if (poolIds.size > 0) {
				await db.delete(schedulerPool).where(inArray(schedulerPool.poolId, [...poolIds]));
			}
		},
	};
}

/**
 * Releases the jobs and queues locked more than {@link deadAfterMs} before
 * `now` by pools no heartbeat has marked alive since then.
 */
async function releaseDeadPools(now: Date) {
	const cutoff = new Date(now.getTime() - deadAfterMs);
	const dead = await db.execute<{
		poolId: string;
	}>(sql`
    select distinct jobs.locked_by as "poolId"
    from graphile_worker.jobs
    where jobs.locked_by is not null
      and jobs.locked_at < ${cutoff.toISOString()}::timestamptz
      and not exists (
        select 1 from ${schedulerPool}
        where ${schedulerPool.poolId} = jobs.locked_by
          and ${schedulerPool.heartbeatAt} >= ${cutoff.toISOString()}::timestamptz
      )
  `);
	const poolIds = [...dead].map((row) => row.poolId);
	if (poolIds.length === 0) {
		return;
	}

	await db.execute(
		sql`select graphile_worker.force_unlock_workers(array[${sql.join(
			poolIds.map((poolId) => sql`${poolId}`),
			sql`, `,
		)}]::text[])`,
	);
	logger.info(`Released the jobs of ${poolIds.length} pools that stopped: ${poolIds.join(", ")}`);
}
