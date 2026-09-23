import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core";

import { timestamptz } from "./columns";

/** Cached AniList GraphQL responses keyed by operation and variables. */
export const anilistSnapshot = pgTable(
  "anilist_snapshot",
  {
    key: text("key").primaryKey(),
    operation: text("operation").notNull(),
    data: jsonb("data").$type<unknown>().notNull(),
    fetchedAt: timestamptz("fetched_at").notNull(),
    expiresAt: timestamptz("expires_at").notNull()
  },
  (table) => [index("anilist_snapshot_expires_idx").on(table.expiresAt)]
);
