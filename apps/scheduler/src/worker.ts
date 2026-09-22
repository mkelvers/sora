import { randomUUID } from 'node:crypto';

import { runAnimeMaintenance, runAnimeScheduler } from '@soraorg/core/maintenance/run';
import { db } from '@soraorg/database';

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
                    } catch {}

                    if (!stopping) {
                        await Bun.sleep(60 * 1_000);
                    }
                }
            })(),
            (async () => {
                while (!stopping) {
                    try {
                        await runAnimeMaintenance(`maintenance-worker:${randomUUID()}`);
                    } catch {}

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
