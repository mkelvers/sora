import { timestamp } from "drizzle-orm/pg-core";

/** A `timestamp with time zone` column; every timestamp in the schema uses one. */
export const timestamptz = (name: string) =>
  timestamp(name, {
    withTimezone: true
  });
