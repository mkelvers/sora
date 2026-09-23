import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/client";
import { anilistSnapshot } from "../database/schema";
import { UpstreamUnavailableError } from "../errors";
import type { TypedDocumentString } from "./graphql.generated";

const endpoint = "https://graphql.anilist.co";

/**
 * Minimum spacing between upstream requests from this process.
 *
 * AniList allows 90 requests per minute per IP and lowers that to 30 when
 * degraded. It starts at 700 ms, under the normal limit, and follows the
 * limit AniList reports on every response; see {@link followRateLimit}.
 */
let requestSpacingMs = 700;

const requestTimeoutMs = 10_000;

/** Freshness policy for one AniList request. */
export interface AniListRequestOptions {
  /**
   * How long a cached response is served without asking AniList again, in
   * milliseconds.
   */
  maxAgeMs: number;
}

/**
 * Validates the GraphQL envelope only.
 *
 * The contents of `data` are typed by codegen from AniList's schema, which is
 * the runtime contract for a GraphQL response. Re-validating every field here
 * would duplicate that schema by hand.
 */
const EnvelopeSchema = z.object({
  data: z.record(z.string(), z.unknown()).nullable().optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        status: z.number().optional()
      })
    )
    .optional()
});

let nextRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Executes a generated AniList operation with caching, request coalescing,
 * and rate limiting.
 *
 * A snapshot younger than `maxAgeMs` is returned without a network call.
 * Identical concurrent requests share one upstream call. When AniList is
 * unavailable, an expired snapshot is served rather than failing.
 *
 * @throws {@link UpstreamUnavailableError} when AniList fails and no snapshot exists.
 *
 * @example
 * ```ts
 * const { Media } = await anilist(AnimeDetailsDocument, { id: 21 }, { maxAgeMs: HOUR });
 * ```
 */
export async function anilist<TResult, TVariables>(
  document: TypedDocumentString<TResult, TVariables>,
  variables: NoInfer<TVariables>,
  options: AniListRequestOptions
): Promise<TResult> {
  const query = document.toString();
  const key = snapshotKey(query, variables);

  const [snapshot] = await db
    .select()
    .from(anilistSnapshot)
    .where(eq(anilistSnapshot.key, key))
    .limit(1);

  if (snapshot && snapshot.fetchedAt.getTime() + options.maxAgeMs > Date.now()) {
    // Stored by this function from a response typed as TResult.
    return snapshot.data as TResult;
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending as Promise<TResult>;
  }

  const request = fetchAndStore<TResult>(key, query, variables, options)
    .catch((cause: unknown) => {
      if (snapshot && cause instanceof UpstreamUnavailableError) {
        return snapshot.data as TResult;
      }

      throw cause;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

async function fetchAndStore<TResult>(
  key: string,
  query: string,
  variables: unknown,
  options: AniListRequestOptions
) {
  const data = await rateLimited(() => execute(query, variables));
  const fetchedAt = new Date();
  const values = {
    operation: operationName(query),
    data,
    fetchedAt,
    expiresAt: new Date(fetchedAt.getTime() + options.maxAgeMs)
  };

  await db
    .insert(anilistSnapshot)
    .values({
      key,
      ...values
    })
    .onConflictDoUpdate({
      target: anilistSnapshot.key,
      set: values
    });

  // The envelope was validated; the payload shape is guaranteed by the schema.
  return data as TResult;
}

/** Serializes upstream calls so they are spaced by {@link requestSpacingMs}. */
function rateLimited<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = nextRequestAt - Date.now();
    if (wait > 0) {
      await Bun.sleep(wait);
    }

    nextRequestAt = Date.now() + requestSpacingMs;
    return task();
  });

  queue = run.catch(() => undefined);
  return run;
}

/**
 * Spaces requests to fit the per-minute limit in AniList's
 * `X-RateLimit-Limit` header, with a small margin for timing jitter.
 *
 * The limit is per IP, so an API and a scheduler on one host can still exceed
 * it together; the 429 handling in `execute` covers that.
 */
function followRateLimit(response: Response) {
  const limit = Number(response.headers.get("x-ratelimit-limit"));
  if (Number.isInteger(limit) && limit > 0) {
    requestSpacingMs = Math.ceil(60_000 / limit) + 100;
  }
}

async function execute(query: string, variables: unknown) {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query,
        variables
      }),
      signal: AbortSignal.timeout(requestTimeoutMs)
    });
  } catch (cause) {
    throw new UpstreamUnavailableError("AniList could not be reached", {
      retryAfterMs: null,
      cause
    });
  }

  followRateLimit(response);

  if (response.status === 429) {
    const retryAfterMs = retryAfter(response) ?? 60_000;
    // Pause every queued request, not just this one.
    nextRequestAt = Math.max(nextRequestAt, Date.now() + retryAfterMs);
    throw new UpstreamUnavailableError("AniList rate limit reached", {
      retryAfterMs
    });
  }

  const body = EnvelopeSchema.safeParse(await response.json().catch(() => null));
  if (!body.success) {
    throw new UpstreamUnavailableError(`AniList returned an invalid ${response.status} response`, {
      retryAfterMs: null,
      cause: body.error
    });
  }

  // AniList reports a missing Media as a 404 GraphQL error with `data.Media: null`.
  // That is a valid answer, not an outage, so it is returned as data.
  const notFoundOnly = body.data.errors?.every((error) => error.status === 404) ?? false;
  if (body.data.data && (response.ok || notFoundOnly)) {
    return body.data.data;
  }

  throw new UpstreamUnavailableError(
    body.data.errors?.[0]?.message ?? `AniList returned ${response.status}`,
    {
      retryAfterMs: retryAfter(response)
    }
  );
}

function retryAfter(response: Response) {
  const seconds = Number(response.headers.get("Retry-After"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : null;
}

function operationName(query: string) {
  const name = /\b(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
  if (!name) {
    throw new TypeError("AniList documents must be named operations");
  }

  return name;
}

/**
 * Derives a stable cache key from the query text and variables.
 *
 * Object keys are sorted so `{ a, b }` and `{ b, a }` share a snapshot, and the
 * query text is included so editing an operation invalidates its snapshots.
 */
function snapshotKey(query: string, variables: unknown) {
  return createHash("sha256")
    .update(query)
    .update("\0")
    .update(JSON.stringify(variables, sortedKeys) ?? "null")
    .digest("hex");
}

function sortedKeys(_key: string, value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  );
}
