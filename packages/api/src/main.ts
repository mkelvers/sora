/**
 * The HTTP API that `@sora/sdk` and generated clients talk to, served on
 * `PORT` (default 3000).
 *
 * Every route is versioned under `/v1`, whose OpenAPI document is served at
 * `/v1/openapi.json`; `/health` is for load balancers. Errors are RFC 9457
 * problems.
 *
 * Run the core's migrations first (`bun run db:migrate` in `packages/core`).
 * Several instances may run at once. It stops cleanly on SIGINT and SIGTERM.
 */
import { closeDatabase } from "@sora/core/database";
import { Hono } from "hono";

import { onError, sendProblem } from "./errors";
import { v1Routes } from "./v1";

const app = new Hono()
  .route("/v1", v1Routes)
  .get("/health", (c) =>
    c.json({
      status: "ok"
    })
  )
  .notFound((c) => sendProblem(c, 404, "NOT_FOUND", `No endpoint matches ${c.req.method} ${c.req.path}`))
  .onError(onError);

/** The API's type, from which `@sora/sdk`'s client derives every route. */
export type AppType = typeof app;

/** The body of every error response. */
export type { Problem } from "./openapi/schemas";

export type * from "./models";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
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
