import { lt, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { providerCalls } from "../../database/schema";
import { day, hour } from "../../time";
import type { StreamProvider } from "./provider";

/** A {@link StreamProvider} method, as `provider_calls` names it. */
export type ProviderOperation = "find_media" | "list_episodes" | "resolve_stream" | "sync_catalog";

/**
 * How a call went: it returned something, returned nothing (no match, no
 * episodes), or threw.
 */
export type CallOutcome = "ok" | "empty" | "failed";

/** One finished call to a provider. */
export interface ProviderCall {
  provider: string;
  operation: ProviderOperation;
  outcome: CallOutcome;
  startedAt: Date;
  durationMs: number;
  /** The error's message, for a failed call. */
  error: string | null;
}

/** Keeps a finished call. Its failure is logged, never passed to the caller. */
export type CallRecorder = (call: ProviderCall) => Promise<void>;

/** Error messages are cut to this length, since some embed whole pages. */
const maxErrorLength = 500;

/** Calls are kept this long. */
const retentionMs = 30 * day;

/**
 * Wraps a provider so every call through it is recorded with its outcome and
 * duration, by default into `provider_calls`.
 *
 * Results and errors pass through unchanged, and recording happens in the
 * background: a call never waits on it or fails because of it.
 */
export function recordingCalls(provider: StreamProvider, record: CallRecorder = storeCall): StreamProvider {
  async function observe<T>(operation: ProviderOperation, call: () => Promise<T>, isEmpty: (result: T) => boolean) {
    const startedAt = new Date();
    const started = performance.now();
    const finish = (outcome: CallOutcome, error: unknown) => {
      const recorded = record({
        provider: provider.id,
        operation,
        outcome,
        startedAt,
        durationMs: Math.round(performance.now() - started),
        error: outcome === "failed" ? errorMessage(error) : null
      });
      recorded.catch((cause: unknown) => {
        console.warn(`Could not record a ${operation} call to ${provider.id}: ${String(cause)}`);
      });
    };

    try {
      const result = await call();
      finish(isEmpty(result) ? "empty" : "ok", null);
      return result;
    } catch (error) {
      finish("failed", error);
      throw error;
    }
  }

  const syncCatalog = provider.syncCatalog?.bind(provider);
  return {
    id: provider.id,
    locale: provider.locale,
    listsLanguages: provider.listsLanguages,
    findMedia: (anime) => observe("find_media", () => provider.findMedia(anime), (match) => match === null),
    listEpisodes: (mediaId) =>
      observe("list_episodes", () => provider.listEpisodes(mediaId), (episodes) => episodes.length === 0),
    resolveStream: (episodeId, language) =>
      observe("resolve_stream", () => provider.resolveStream(episodeId, language), () => false),
    ...(syncCatalog && {
      syncCatalog: (options) => observe("sync_catalog", () => syncCatalog(options), () => false)
    })
  };
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > maxErrorLength ? `${message.slice(0, maxErrorLength - 1)}…` : message;
}

/** Adds a call to its provider's, operation's, and hour's row of `provider_calls`. */
async function storeCall(call: ProviderCall) {
  const failed = call.outcome === "failed";
  await db
    .insert(providerCalls)
    .values({
      provider: call.provider,
      operation: call.operation,
      hour: new Date(Math.floor(call.startedAt.getTime() / hour) * hour),
      ok: call.outcome === "ok" ? 1 : 0,
      empty: call.outcome === "empty" ? 1 : 0,
      failed: failed ? 1 : 0,
      durationMs: call.durationMs,
      lastError: call.error,
      lastErrorAt: failed ? call.startedAt : null
    })
    .onConflictDoUpdate({
      target: [
        providerCalls.provider,
        providerCalls.operation,
        providerCalls.hour
      ],
      set: {
        ok: sql`${providerCalls.ok} + excluded.ok`,
        empty: sql`${providerCalls.empty} + excluded.empty`,
        failed: sql`${providerCalls.failed} + excluded.failed`,
        durationMs: sql`${providerCalls.durationMs} + excluded.duration_ms`,
        lastError: sql`coalesce(excluded.last_error, ${providerCalls.lastError})`,
        lastErrorAt: sql`coalesce(excluded.last_error_at, ${providerCalls.lastErrorAt})`
      }
    });
}

/**
 * Deletes recorded calls older than a month.
 *
 * @returns How many hourly rows were deleted.
 */
export async function pruneProviderCalls() {
  const deleted = await db
    .delete(providerCalls)
    .where(lt(providerCalls.hour, new Date(Date.now() - retentionMs)))
    .returning({
      provider: providerCalls.provider
    });
  return deleted.length;
}
