import { customType, timestamp } from "drizzle-orm/pg-core";

/** A `timestamp with time zone` column; every timestamp in the schema uses one. */
export const timestamptz = (name: string) =>
  timestamp(name, {
    withTimezone: true
  });

/**
 * A `jsonb` column; use this instead of drizzle's own.
 *
 * Drizzle's `jsonb` serializes values to a string before handing them to the
 * driver, and Bun's SQL driver then encodes that string as JSON once more, so
 * every value would be stored as a JSON string scalar. Bun encodes objects
 * and arrays itself, so values are passed through unchanged.
 */
export const jsonb = customType<{
  data: unknown;
  driverData: unknown;
}>({
  dataType: () => "jsonb",
  toDriver: (value) => value,
  fromDriver: (value) => value
});
