/**
 * Applies every pending migration, including graphile-worker's: `bun run db:migrate`.
 */
import { db, migrate } from "./client";

await migrate();

await db.$client.close();
