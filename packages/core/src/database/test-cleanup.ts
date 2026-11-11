/**
 * Preloaded by `bun test` through `bunfig.toml`.
 *
 * Tests share the development database, so every fixture title gets a
 * negative AniList ID, which no real anime has. Code under test queues
 * scheduler jobs for those titles; once the run ends, they are deleted, and
 * the connection pool closes.
 */
import { afterAll } from "bun:test";

import { sql } from "drizzle-orm";

import { closeDatabase, db } from "./client";

afterAll(async () => {
	// Deleted directly, since graphile_worker.remove_job keeps a job a running
	// scheduler has locked, only clearing its key and marking it failed.
	await db.execute(sql`
		delete from graphile_worker._private_jobs
		where payload->>'anilistId' ~ '^-[0-9]+$'
	`);
	await closeDatabase();
});
