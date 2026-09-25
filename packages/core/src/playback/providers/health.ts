import { sql } from "drizzle-orm";

import { db } from "../../database/client";
import { providerCalls } from "../../database/schema";
import { day, hour } from "../../time";
import type { ProviderOperation } from "./calls";
import { streamProviders } from "./registry";

/**
 * A provider that is being called but has had no successful call for this
 * long counts as failing.
 */
export const failingAfterMs = 3 * hour;

/**
 * Calls without a success it takes, within {@link failingAfterMs}, to count a
 * provider as failing. A few misses are normal: a provider does not carry
 * every title, and a quiet hour may only ask it for ones it lacks.
 */
export const failingAfterCalls = 5;

/** Calls are summarized over this window. */
const summaryWindowMs = day;

/**
 * - `ok`: a call succeeded within {@link failingAfterMs}.
 * - `failing`: at least {@link failingAfterCalls} calls were made within
 *   {@link failingAfterMs}, and every one failed or came back empty.
 * - `idle`: too few calls were made within {@link failingAfterMs} to tell.
 */
export type ProviderStatus = "ok" | "failing" | "idle";

/** One provider operation's calls over the last day. */
export interface OperationSummary {
  operation: ProviderOperation;
  ok: number;
  empty: number;
  failed: number;
  /** Mean duration of a call. */
  averageMs: number;
}

/** How a stream provider has been doing, from the calls made to it. */
export interface ProviderHealth {
  provider: string;
  status: ProviderStatus;
  /**
   * Start of the latest hour with a successful call, as an ISO 8601
   * timestamp, or `null` when none is on record. Records go back a month.
   */
  lastOkAt: string | null;
  /** The latest failed call's error, or `null` when none is on record. */
  lastError: string | null;
  /** When the latest failed call started, as an ISO 8601 timestamp. */
  lastErrorAt: string | null;
  /** Calls in the last day, by operation. Operations without calls are left out. */
  operations: OperationSummary[];
}

/** What {@link getProviderHealth} reads for one provider operation. */
export interface OperationRow {
  provider: string;
  operation: string;
  /** Counts and total duration over the summary window. */
  ok: number;
  empty: number;
  failed: number;
  durationMs: number;
  /** Start of the latest hour with a successful call. */
  lastOkHour: Date | null;
  /** Calls since the start of {@link recentFrom}. */
  recentCalls: number;
  lastError: string | null;
  lastErrorAt: Date | null;
}

/**
 * How each stream provider has been doing, in the order playback tries them,
 * from what `provider_calls` recorded.
 */
export async function getProviderHealth(now = new Date()): Promise<ProviderHealth[]> {
  const windowStart = new Date(now.getTime() - summaryWindowMs);
  const inWindow = sql`${providerCalls.hour} >= ${windowStart}`;
  const isRecent = sql`${providerCalls.hour} >= ${recentFrom(now)}`;
  const calls = sql`${providerCalls.ok} + ${providerCalls.empty} + ${providerCalls.failed}`;
  const rows = await db
    .select({
      provider: providerCalls.provider,
      operation: providerCalls.operation,
      ok: sql<number>`coalesce(sum(${providerCalls.ok}) filter (where ${inWindow}), 0)`.mapWith(Number),
      empty: sql<number>`coalesce(sum(${providerCalls.empty}) filter (where ${inWindow}), 0)`.mapWith(Number),
      failed: sql<number>`coalesce(sum(${providerCalls.failed}) filter (where ${inWindow}), 0)`.mapWith(Number),
      durationMs: sql<number>`coalesce(sum(${providerCalls.durationMs}) filter (where ${inWindow}), 0)`.mapWith(Number),
      lastOkHour: sql<Date | null>`max(${providerCalls.hour}) filter (where ${providerCalls.ok} > 0)`.mapWith(toDate),
      recentCalls: sql<number>`coalesce(sum(${calls}) filter (where ${isRecent}), 0)`.mapWith(Number),
      lastError: sql<string | null>`(array_agg(${providerCalls.lastError} order by ${providerCalls.lastErrorAt} desc nulls last))[1]`,
      lastErrorAt: sql<Date | null>`max(${providerCalls.lastErrorAt})`.mapWith(toDate)
    })
    .from(providerCalls)
    .groupBy(providerCalls.provider, providerCalls.operation);

  return summarizeHealth(
    streamProviders.map((provider) => provider.id),
    rows,
    now
  );
}

/**
 * Folds per-operation rows into one {@link ProviderHealth} per provider in
 * `providerIds`. Rows of other providers, such as removed ones, are ignored.
 */
export function summarizeHealth(providerIds: readonly string[], rows: readonly OperationRow[], now: Date): ProviderHealth[] {
  const recent = recentFrom(now).getTime();

  return providerIds.map((provider) => {
    const own = rows.filter((row) => row.provider === provider);
    const latest = (pick: (row: OperationRow) => Date | null) =>
      own.reduce<Date | null>((found, row) => {
        const value = pick(row);
        return value && (!found || value > found) ? value : found;
      }, null);

    const lastOk = latest((row) => row.lastOkHour);
    const recentCalls = own.reduce((total, row) => total + row.recentCalls, 0);
    const lastErrorAt = latest((row) => row.lastErrorAt);
    const lastError = own.find((row) => lastErrorAt !== null && row.lastErrorAt?.getTime() === lastErrorAt.getTime());
    const status: ProviderStatus =
      lastOk !== null && lastOk.getTime() >= recent ? "ok" : recentCalls >= failingAfterCalls ? "failing" : "idle";

    return {
      provider,
      status,
      lastOkAt: lastOk?.toISOString() ?? null,
      lastError: lastError?.lastError ?? null,
      lastErrorAt: lastErrorAt?.toISOString() ?? null,
      operations: own
        .filter((row) => row.ok + row.empty + row.failed > 0)
        .map((row) => {
          const calls = row.ok + row.empty + row.failed;
          return {
            operation: row.operation as ProviderOperation,
            ok: row.ok,
            empty: row.empty,
            failed: row.failed,
            averageMs: Math.round(row.durationMs / calls)
          };
        })
        .sort((left, right) => left.operation.localeCompare(right.operation))
    };
  });
}

/**
 * Start of the first hour that counts as recent. Hours are stored by their
 * start, so an hour counts if any of it is within {@link failingAfterMs}.
 */
function recentFrom(now: Date) {
  return new Date(Math.floor((now.getTime() - failingAfterMs) / hour) * hour);
}

function toDate(value: unknown) {
  return value === null ? null : new Date(value as string | Date);
}
