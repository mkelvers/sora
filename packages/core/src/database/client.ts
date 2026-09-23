import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

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
 * Applies pending migrations from `packages/core/drizzle`.
 *
 * Call once at process startup, from a single process, before serving
 * requests. Running it from several replicas at once is not safe.
 */
export async function migrateDatabase() {
  await migrate(db, {
    migrationsFolder: new URL("../../drizzle", import.meta.url).pathname
  });
}

/** Closes the connection pool so the process can exit cleanly. */
export async function closeDatabase() {
  await db.$client.close();
}
