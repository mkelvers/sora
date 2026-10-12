import { attempt } from "@sora/shared";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { runMigrations } from "graphile-worker";

import { config } from "../config";
import * as schema from "./schema";

/**
 * The process-wide database connection.
 *
 * Persistence code imports this directly; it is never passed through
 * parameters or constructors.
 */
export const db = drizzle({
	client: new SQL(config.databaseUrl),
	schema,
});

/** The advisory lock replicas hold, one at a time, while they migrate. */
export const migrationLockKey = 7_302_024_001;

/**
 * Applies pending migrations from `packages/core/drizzle`, then
 * graphile-worker's own.
 *
 * Call once at process startup, before serving requests. Replicas starting
 * together take turns: each holds a PostgreSQL advisory lock while it
 * migrates, so a later one finds nothing left to apply.
 */
export async function migrateDatabase() {
	const lock = await db.$client.reserve();
	const migrated = await attempt(
		(async () => {
			await lock`select pg_advisory_lock(${migrationLockKey}::bigint)`;
			await migrate(db, {
				migrationsFolder: new URL("../../drizzle", import.meta.url).pathname,
			});
			// The catalog enqueues scheduler jobs with SQL, so graphile-worker's schema
			// must exist before any request, not only once a scheduler has started.
			await runMigrations({
				connectionString: config.databaseUrl,
			});
		})(),
	);
	// Releasing the connection ends the session, which drops the lock even when unlocking failed.
	await attempt(lock`select pg_advisory_unlock(${migrationLockKey}::bigint)`);
	lock.release();
	if (migrated.error) {
		throw migrated.error;
	}
}

/** Closes the connection pool so the process can exit cleanly. */
export async function closeDatabase() {
	await db.$client.close();
}
