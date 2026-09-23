/**
 * Applies every pending migration, including graphile-worker's: `bun run db:migrate`.
 */
import { closeDatabase, migrateDatabase } from "./client";

await migrateDatabase();
await closeDatabase();
