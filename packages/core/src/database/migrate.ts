/**
 * Applies every pending migration, including graphile-worker's: `bun run db:migrate`.
 */
import { db, migrateDatabase } from "./client";

await migrateDatabase();

await db.$client.close();
