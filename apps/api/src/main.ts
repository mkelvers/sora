/**
 * The HTTP API that `@sora/sdk` and generated clients talk to, served on
 * `PORT` (default 3000).
 *
 * Every route is versioned under `/v1`, whose OpenAPI document is served at
 * `/v1/openapi.json` for signed-in accounts; `/health` is for load balancers
 * and tells signed-in accounts how each stream provider has been doing. Errors are RFC 9457 problems.
 *
 * It listens on `HOST` (default `127.0.0.1`, so only this machine reaches
 * it); set `HOST=0.0.0.0` to serve other machines, such as in a container.
 *
 * Run the core's migrations first (`bun run db:migrate` in `packages/core`).
 * Several instances may run at once. It stops cleanly on SIGINT and SIGTERM.
 */
import { auth } from "@sora/core/auth";
import { closeDatabase } from "@sora/core/database";
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

import { onError, sendProblem } from "./errors";
import { healthRoutes } from "./health";
import { v1Routes } from "./v1";

const app = new Hono()
	.use(
		secureHeaders({
			contentSecurityPolicy: {
				defaultSrc: ["'none'"],
				frameAncestors: ["'none'"],
			},
			// Players on other origins load streams and subtitles directly.
			crossOriginResourcePolicy: false,
		}),
	)
	.route("/v1", v1Routes)
	.route(
		"/health",
		healthRoutes(undefined, async (headers) => {
			const session = await auth.api.getSession({
				headers,
			});
			return session !== null;
		}),
	)
	.notFound((c) =>
		sendProblem(c, 404, "NOT_FOUND", `No endpoint matches ${c.req.method} ${c.req.path}`),
	)
	.onError(onError);

/** The body of every error response. */
export type { Problem } from "./openapi/schemas";

export type * from "./models";

const server = Bun.serve({
	hostname: process.env.HOST ?? "127.0.0.1",
	port: Number(process.env.PORT ?? 3000),
	// Every request body here is a small JSON document; Bun's default allows 128 MiB.
	maxRequestBodySize: 1024 * 1024,
	fetch: app.fetch,
	// Resolving playback and laying out a new title can take several seconds
	// before the first byte, well past Bun's default of 10.
	idleTimeout: 120,
});

console.log(`Sora API listening on ${server.url}`);

async function shutdown() {
	await server.stop();
	await closeDatabase();
	process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
