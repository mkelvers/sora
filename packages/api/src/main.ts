/**
 * Serves the HTTP API.
 *
 * Run the core's and the API's migrations first (`bun run db:migrate` in
 * `packages/core`, then in `packages/api`). Several instances may run at
 * once. It stops cleanly on SIGINT and SIGTERM.
 */
import { closeDatabase } from "@sora/core/database";

import { createApp } from "./app";
import { config } from "./config";

const app = createApp();

const server = Bun.serve({
  port: config.port,
  fetch: app.fetch,
  // Resolving playback and laying out a new title can take several seconds
  // before the first byte, well past Bun's default of 10.
  idleTimeout: 120
});

console.log(`Sora API listening on ${server.url}`);

async function shutdown() {
  await server.stop();
  await closeDatabase();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
