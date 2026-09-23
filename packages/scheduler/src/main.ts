/**
 * Runs the background scheduler, which follows every airing anime and stores
 * each new episode once a provider carries it.
 *
 * Start it after `bun run db:migrate` in `packages/core`; several instances
 * may run at once. It stops cleanly on SIGINT and SIGTERM.
 */
import { closeDatabase } from "@sora/core/database";
import { startScheduler } from "@sora/core/scheduler";

const runner = await startScheduler();
await runner.promise;
await closeDatabase();
