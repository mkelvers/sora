import { createHash } from "node:crypto";

import { attempt } from "@sora/attempt";
import { eq } from "drizzle-orm";
import type { z } from "zod";

import { config } from "../config";
import { db } from "../database/client";
import { tmdbResponse } from "../database/schema";
import { UpstreamUnavailableError } from "../errors";
import { InFlight } from "../in-flight";

const endpoint = "https://api.themoviedb.org/3";

/**
 * Minimum spacing between the starts of upstream requests from this process.
 *
 * TMDB allows roughly 40 requests per second per IP. Requests may overlap;
 * only their start times are spaced, which keeps a franchise lookup that
 * needs dozens of calls fast without bursting past the limit.
 */
const requestSpacingMs = 30;

const requestTimeoutMs = 10_000;

/** A 429 is retried this many times before giving up. */
const rateLimitRetries = 2;

/** Freshness policy for one TMDB request. */
export interface TmdbRequestOptions {
	/**
	 * How old a stored response may be and still be served without asking
	 * TMDB again, in milliseconds.
	 */
	maxAgeMs: number;
	/**
	 * Whether the response is stored (see `tmdbResponse`). A request that never
	 * repeats, such as one carrying a nonce, should not be.
	 *
	 * @defaultValue true
	 */
	store?: boolean;
}

let nextRequestAt = 0;
const inFlight = new InFlight<string, unknown>();

/**
 * Fetches a TMDB v3 resource with request coalescing and rate limiting,
 * storing the response (see `tmdbResponse`), and validates it against
 * `schema`.
 *
 * A stored response younger than `maxAgeMs` is returned without a network
 * call. Identical concurrent requests share one upstream call. When TMDB is
 * unavailable, an older stored response is served rather than failing.
 *
 * @returns The validated response, or `null` when TMDB answers 404.
 * @throws {@link UpstreamUnavailableError} when TMDB fails or returns data
 *   that does not match `schema`, and no usable response is stored.
 *
 * @example
 * ```ts
 * const show = await tmdb("/tv/82684", {}, TvShowSchema, { maxAgeMs: day });
 * ```
 */
export async function tmdb<TSchema extends z.ZodType>(
	path: string,
	query: Record<string, string>,
	schema: TSchema,
	options: TmdbRequestOptions,
): Promise<z.infer<TSchema> | null> {
	const url = new URL(`${endpoint}${path}`);
	for (const [name, value] of Object.entries(query).sort(([left], [right]) =>
		left.localeCompare(right),
	)) {
		url.searchParams.set(name, value);
	}

	const key = createHash("sha256").update(url.toString()).digest("hex");
	const [stored] =
		options.store === false
			? []
			: await db.select().from(tmdbResponse).where(eq(tmdbResponse.key, key)).limit(1);

	const kept = stored ? schema.safeParse(stored.data) : null;
	if (stored && kept?.success && stored.fetchedAt.getTime() + options.maxAgeMs > Date.now()) {
		return kept.data;
	}

	const { data, error } = await attempt(
		inFlight.run(key, () => fetchAndStore(key, path, url, options)),
		UpstreamUnavailableError,
	);
	if (error) {
		if (kept?.success) {
			return kept.data;
		}
		throw error;
	}

	if (data === null) {
		return null;
	}

	const parsed = schema.safeParse(data);
	if (!parsed.success) {
		throw new UpstreamUnavailableError(`TMDB returned an unexpected response for ${path}`, {
			retryAfterMs: null,
			cause: parsed.error,
		});
	}

	return parsed.data;
}

/** Fetches one resource and stores it unless told not to. A 404 is returned as `null` and not stored. */
async function fetchAndStore(key: string, path: string, url: URL, options: TmdbRequestOptions) {
	const data = await execute(url);
	if (data === null || options.store === false) {
		return data;
	}

	const values = {
		path,
		data,
		fetchedAt: new Date(),
	};

	await db
		.insert(tmdbResponse)
		.values({
			key,
			...values,
		})
		.onConflictDoUpdate({
			target: tmdbResponse.key,
			set: values,
		});

	return data;
}

async function execute(url: URL): Promise<unknown> {
	for (let tries = 0; ; tries += 1) {
		await nextSlot();

		const { data: response, error: unreachable } = await attempt(
			fetch(url, {
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${config.tmdbReadAccessToken}`,
				},
				signal: AbortSignal.timeout(requestTimeoutMs),
			}),
		);
		if (unreachable) {
			throw new UpstreamUnavailableError("TMDB could not be reached", {
				retryAfterMs: null,
				cause: unreachable,
			});
		}

		if (response.status === 429) {
			const retryAfterMs = retryAfter(response) ?? 2_000;
			// Pause every request from this process, not just this one.
			nextRequestAt = Math.max(nextRequestAt, Date.now() + retryAfterMs);
			if (tries < rateLimitRetries) {
				continue;
			}

			throw new UpstreamUnavailableError("TMDB rate limit reached", {
				retryAfterMs,
			});
		}

		if (response.status === 404) {
			return null;
		}

		if (!response.ok) {
			throw new UpstreamUnavailableError(`TMDB returned ${response.status} for ${url.pathname}`, {
				retryAfterMs: retryAfter(response),
			});
		}

		const { data: body, error: unreadable } = await attempt(response.json());
		if (unreadable) {
			throw new UpstreamUnavailableError(
				`TMDB returned a response for ${url.pathname} that is not JSON`,
				{
					retryAfterMs: null,
					cause: unreadable,
				},
			);
		}
		return body;
	}
}

/** Waits until this request may start, reserving the following slot for the next caller. */
async function nextSlot() {
	const startAt = Math.max(Date.now(), nextRequestAt);
	nextRequestAt = startAt + requestSpacingMs;

	const wait = startAt - Date.now();
	if (wait > 0) {
		await Bun.sleep(wait);
	}
}

function retryAfter(response: Response) {
	const seconds = Number(response.headers.get("Retry-After"));
	return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : null;
}
