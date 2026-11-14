import { attempt } from "@sora/shared";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { runMigrations } from "graphile-worker";

import { config } from "../config";
import { readMigrationHistory, skippedMigrations } from "./migration-history";
import * as auth from "./schema/auth";
import * as catalog from "./schema/catalog";
import * as library from "./schema/library";
import * as playback from "./schema/playback";
import * as scheduler from "./schema/scheduler";
import * as series from "./schema/series";

/**
 * The process-wide database connection.
 *
 * Persistence code imports this directly; it is never passed through
 * parameters or constructors.
 */
export const db = drizzle({
	client: new SQL(config.databaseUrl),
	schema: {
		...auth,
		...catalog,
		...library,
		...playback,
		...scheduler,
		...series,
	},
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
 *
 * Refuses to migrate when drizzle would skip a migration without saying so
 * (see {@link skippedMigrations}), naming each one; AGENTS.md says how to
 * repair the database.
 */
export const migrateDatabase = async () => {
	const lock = await db.$client.reserve();
	const migrated = await attempt(
		(async () => {
			await lock`select pg_advisory_lock(${migrationLockKey}::bigint)`;
			const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname;
			const [{ exists }] = await lock<[{ exists: boolean }]>`
        select to_regclass('drizzle.__drizzle_migrations') is not null as exists
      `;
			const recorded = exists
				? await lock<{ created_at: string; hash: string }[]>`
            select created_at, hash from drizzle.__drizzle_migrations
          `
				: [];
			const skipped = skippedMigrations(
				readMigrationHistory(migrationsFolder),
				recorded.map(({ created_at, hash }) => ({
					createdAt: Number(created_at),
					hash,
				})),
			);
			if (skipped.length > 0) {
				throw new Error(
					`The database's migration history does not match packages/core/drizzle, so drizzle would skip migrations without saying so. Repair it as AGENTS.md says under "Database migrations":\n${skipped.map((reason) => `- ${reason}`).join("\n")}`,
				);
			}

			await migrate(db, {
				migrationsFolder,
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
};

/** Closes the connection pool so the process can exit cleanly. */
export const closeDatabase = async () => {
	await db.$client.close();
};
