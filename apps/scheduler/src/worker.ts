import { randomUUID } from 'node:crypto';

import { runAnimeMaintenance, runAnimeScheduler } from '@soraorg/core/maintenance/run';
import { db } from '@soraorg/database';

/**
 * Runs the scheduler heartbeat and maintenance queue as independent polling loops.
 *
 * The heartbeat starts a pass every 60 seconds and maintenance every 10 seconds,
 * measured from completion of the previous pass. SIGINT and SIGTERM stop future
 * iterations; current work is allowed to finish before the database connection
 * is closed because provider and database operations do not support cancellation.
 * The returned promise resolves after both loops finish and the database closes.
 */
export async function startScheduler() {
    let stopping = false;
    const stop = () => {
        stopping = true;
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);

    try {
        await Promise.all([
            (async () => {
                while (!stopping) {
                    try {
                        await runAnimeScheduler();
                    } catch {
                        // Run-level failures are recorded in the heartbeat when possible; keep polling so due work can retry.
                    }

                    if (!stopping) {
                        await Bun.sleep(60 * 1_000);
                    }
                }
            })(),
            (async () => {
                while (!stopping) {
                    try {
                        await runAnimeMaintenance(`maintenance-worker:${randomUUID()}`);
                    } catch {
                        // Task failures are persisted by the runner; keep polling after unexpected errors too.
                    }

                    if (!stopping) {
                        await Bun.sleep(10 * 1_000);
                    }
                }
            })(),
        ]);
    } finally {
        await db.$client.end();
    }
}
