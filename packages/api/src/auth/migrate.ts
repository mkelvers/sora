/**
 * Applies the API's pending migrations (Better Auth's tables).
 *
 * Run once per deploy, after the core's `db:migrate`, from a single process.
 */
import { closeDatabase, db } from "@sora/core/database";
import { migrate } from "drizzle-orm/bun-sql/migrator";

await migrate(db, {
  migrationsFolder: new URL("../../drizzle", import.meta.url).pathname,
  // The core's history is `drizzle.__drizzle_migrations`.
  migrationsTable: "__drizzle_migrations_api",
  migrationsSchema: "drizzle"
});
await closeDatabase();
