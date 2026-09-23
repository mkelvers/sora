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
  schema
});

/**
 * Applies pending migrations from `packages/core/drizzle`, then
 * graphile-worker's own.
 *
 * Call once at process startup, from a single process, before serving
 * requests. Running it from several replicas at once is not safe.
 */
export async function migrateDatabase() {
  await migrate(db, {
    migrationsFolder: new URL("../../drizzle", import.meta.url).pathname
  });
  // The catalog enqueues scheduler jobs with SQL, so graphile-worker's schema
  // must exist before any request, not only once a scheduler has started.
  await runMigrations({
    connectionString: config.databaseUrl
  });
}

/** Closes the connection pool so the process can exit cleanly. */
export async function closeDatabase() {
  await db.$client.close();
}
