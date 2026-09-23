import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import type { z } from "zod";

import { config } from "../config";
import { db } from "../database/client";
import { tmdbSnapshot } from "../database/schema";
import { UpstreamUnavailableError } from "../errors";

const endpoint = "https://api.themoviedb.org/3";

/**
 * Minimum spacing between the starts of upstream requests from this process.
 *
 * TMDB allows roughly 50 requests per second per IP. Requests may overlap;
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
   * How long a cached response is served without asking TMDB again, in
   * milliseconds.
   */
  maxAgeMs: number;
}

let nextRequestAt = 0;
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Fetches a TMDB v3 resource with caching, request coalescing, and rate
 * limiting, and validates it against `schema`.
 *
 * A snapshot younger than `maxAgeMs` is returned without a network call.
 * Identical concurrent requests share one upstream call. When TMDB is
 * unavailable, an expired snapshot is served rather than failing.
 *
 * @returns The validated response, or `null` when TMDB answers 404.
 * @throws {@link UpstreamUnavailableError} when TMDB fails or returns data
 *   that does not match `schema`, and no usable snapshot exists.
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
  options: TmdbRequestOptions
): Promise<z.infer<TSchema> | null> {
  const url = new URL(`${endpoint}${path}`);
  for (const [name, value] of Object.entries(query).sort(([left], [right]) => left.localeCompare(right))) {
    url.searchParams.set(name, value);
  }

  const key = createHash("sha256").update(url.toString()).digest("hex");
  const [snapshot] = await db
    .select()
    .from(tmdbSnapshot)
    .where(eq(tmdbSnapshot.key, key))
    .limit(1);

  const cached = snapshot ? schema.safeParse(snapshot.data) : null;
  if (snapshot && cached?.success && snapshot.fetchedAt.getTime() + options.maxAgeMs > Date.now()) {
    return cached.data;
  }

  let pending = inFlight.get(key);
  if (!pending) {
    pending = fetchAndStore(key, path, url, options).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, pending);
  }

  let data: unknown;
  try {
    data = await pending;
  } catch (cause) {
    if (cached?.success && cause instanceof UpstreamUnavailableError) {
      return cached.data;
    }

    throw cause;
  }

  if (data === null) {
    return null;
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new UpstreamUnavailableError(`TMDB returned an unexpected response for ${path}`, {
      retryAfterMs: null,
      cause: parsed.error
    });
  }

  return parsed.data;
}

/** Fetches one resource and stores it as a snapshot. A 404 is returned as `null` and not stored. */
async function fetchAndStore(key: string, path: string, url: URL, options: TmdbRequestOptions) {
  const data = await execute(url);
  if (data === null) {
    return null;
  }

  const fetchedAt = new Date();
  const values = {
    path,
    data,
    fetchedAt,
    expiresAt: new Date(fetchedAt.getTime() + options.maxAgeMs)
  };

  await db
    .insert(tmdbSnapshot)
    .values({
      key,
      ...values
    })
    .onConflictDoUpdate({
      target: tmdbSnapshot.key,
      set: values
    });

  return data;
}

async function execute(url: URL): Promise<unknown> {
  for (let attempt = 0; ; attempt += 1) {
    await nextSlot();

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.tmdbReadAccessToken}`
        },
        signal: AbortSignal.timeout(requestTimeoutMs)
      });
    } catch (cause) {
      throw new UpstreamUnavailableError("TMDB could not be reached", {
        retryAfterMs: null,
        cause
      });
    }

    if (response.status === 429) {
      const retryAfterMs = retryAfter(response) ?? 2_000;
      // Pause every request from this process, not just this one.
      nextRequestAt = Math.max(nextRequestAt, Date.now() + retryAfterMs);
      if (attempt < rateLimitRetries) {
        continue;
      }

      throw new UpstreamUnavailableError("TMDB rate limit reached", {
        retryAfterMs
      });
    }

    if (response.status === 404) {
      return null;
    }

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || body === null) {
      throw new UpstreamUnavailableError(`TMDB returned ${response.status} for ${url.pathname}`, {
        retryAfterMs: retryAfter(response)
      });
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
