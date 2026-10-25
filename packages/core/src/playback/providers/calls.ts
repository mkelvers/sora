import { attempt, day, hour } from "@sora/shared";
import { lt, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { providerCalls } from "../../database/schema";
import type { StreamProvider } from "./provider";

/** A {@link StreamProvider} method, as `provider_calls` names it. */
export type ProviderOperation = "find_media" | "list_episodes" | "resolve_stream" | "sync_catalog";

/**
 * How a call went: it returned something, returned nothing (no match, no
 * episodes), or threw.
 */
type CallOutcome = "ok" | "empty" | "failed";

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

/** Adds a call to its provider's, operation's, and hour's row of `provider_calls`. */
const storeCall = async (call: ProviderCall) => {
	const failed = call.outcome === "failed";
	await db
		.insert(providerCalls)
		.values({
			durationMs: call.durationMs,
			empty: call.outcome === "empty" ? 1 : 0,
			failed: failed ? 1 : 0,
			hour: new Date(Math.floor(call.startedAt.getTime() / hour) * hour),
			lastError: call.error,
			lastErrorAt: failed ? call.startedAt : null,
			ok: call.outcome === "ok" ? 1 : 0,
			operation: call.operation,
			provider: call.provider,
		})
		.onConflictDoUpdate({
			set: {
				durationMs: sql`${providerCalls.durationMs} + excluded.duration_ms`,
				empty: sql`${providerCalls.empty} + excluded.empty`,
				failed: sql`${providerCalls.failed} + excluded.failed`,
				lastError: sql`coalesce(excluded.last_error, ${providerCalls.lastError})`,
				lastErrorAt: sql`coalesce(excluded.last_error_at, ${providerCalls.lastErrorAt})`,
				ok: sql`${providerCalls.ok} + excluded.ok`,
			},
			target: [providerCalls.provider, providerCalls.operation, providerCalls.hour],
		});
};

const errorMessage = (error: Error) => {
	const { message } = error;
	return message.length > maxErrorLength ? `${message.slice(0, maxErrorLength - 1)}…` : message;
};

/**
 * Wraps a provider so every call through it is recorded with its outcome and
 * duration, by default into `provider_calls`.
 *
 * Results and errors pass through unchanged, and recording happens in the
 * background: a call never waits on it or fails because of it.
 */
export const recordingCalls = (
	provider: StreamProvider,
	record: CallRecorder = storeCall,
): StreamProvider => {
	const observe = async <T>(
		operation: ProviderOperation,
		call: () => Promise<T>,
		isEmpty: (result: T) => boolean,
	) => {
		const startedAt = new Date();
		const started = performance.now();
		const finish = async (outcome: CallOutcome, error: Error | null) => {
			const recorded = await attempt(
				record({
					durationMs: Math.round(performance.now() - started),
					error: error ? errorMessage(error) : null,
					operation,
					outcome,
					provider: provider.id,
					startedAt,
				}),
			);
			if (recorded.error) {
				console.warn(
					`Could not record a ${operation} call to ${provider.id}: ${recorded.error.message}`,
				);
			}
		};

		const { data, error } = await attempt(call());
		if (error) {
			void finish("failed", error);
			throw error;
		}
		void finish(isEmpty(data) ? "empty" : "ok", null);
		return data;
	};

	const syncCatalog = provider.syncCatalog?.bind(provider);
	return {
		findMedia: (anime) =>
			observe(
				"find_media",
				() => provider.findMedia(anime),
				(match) => match === null,
			),
		id: provider.id,
		listEpisodes: (mediaId) =>
			observe(
				"list_episodes",
				() => provider.listEpisodes(mediaId),
				(episodes) => episodes.length === 0,
			),
		listsLanguages: provider.listsLanguages,
		locale: provider.locale,
		resolveStream: (episodeId, language) =>
			observe(
				"resolve_stream",
				() => provider.resolveStream(episodeId, language),
				() => false,
			),
		...(syncCatalog && {
			syncCatalog: (options) =>
				observe(
					"sync_catalog",
					() => syncCatalog(options),
					() => false,
				),
		}),
	};
};

/**
 * Deletes recorded calls older than a month.
 *
 * @returns How many hourly rows were deleted.
 */
export const pruneProviderCalls = async () => {
	const deleted = await db
		.delete(providerCalls)
		.where(lt(providerCalls.hour, new Date(Date.now() - retentionMs)))
		.returning({
			provider: providerCalls.provider,
		});
	return deleted.length;
};
