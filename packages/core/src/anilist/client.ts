import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/client";
import { anilistSnapshot } from "../database/schema";
import { UpstreamUnavailableError } from "../errors";
import type { TypedDocumentString } from "./graphql.generated";

const endpoint = "https://graphql.anilist.co";

/**
 * Requests per minute AniList allows this IP: 90, or 30 when degraded.
 * Starts at the normal limit and follows the one AniList reports on every
 * response; see {@link followRateLimit}.
 */
let requestLimit = 90;

/**
 * Minimum spacing between requests a viewer is waiting on. They may use the
 * {@link viewerReserve} without waiting for a new window, but AniList also
 * limits bursts: 300 ms and 700 ms apart ran into it within ten requests,
 * with most of the minute's budget still left.
 */
const viewerSpacingMs = 1_000;

/**
 * Requests of each minute's budget kept for requests a viewer is waiting
 * on: background requests wait rather than spend them. A search that finds
 * a title not stored yet needs about three, for a few titles at once.
 */
const viewerReserve = 10;

/**
 * The most urgent priority of background work. Requests at a more urgent
 * priority, or made outside any, are made for a viewer who is waiting on
 * them; see {@link withAniListPriority}.
 */
export const viewerWaitingPriority = -2;

/** What is left of AniList's budget; see {@link Budget}. */
let budget: Budget | null = null;

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
        status: z.number().optional(),
      })
    )
    .optional(),
});

/** When the next request of any kind may be sent, pushed back after a 429. */
let nextRequestAt = 0;
/** When each request of the last minute was sent; see {@link LimiterState}. */
let recentSends: number[] = [];
const inFlight = new Map<string, Promise<unknown>>();

/** A request waiting for its turn under the rate limit. */
interface QueuedRequest {
  /** The snapshot key of the request, which callers asking the same share. */
  key: string;
  priority: number;
  /** Sends the request and settles its caller's promise; never rejects. */
  send: () => Promise<void>;
}

/** Requests waiting for their turn, most urgent first and, within a priority, oldest first. */
const waiting: QueuedRequest[] = [];
let isDraining = false;

const priorityContext = new AsyncLocalStorage<number>();

/**
 * Runs `work` with the AniList requests it makes queued at `priority`,
 * lower numbers first, as graphile-worker orders jobs.
 *
 * Requests made outside any priority go first of all: they are made while
 * serving someone, whereas the scheduler runs each job under the job's own
 * priority. A job a viewer is waiting on then gets AniList's limited
 * requests ahead of a catalogue sync that makes hundreds.
 */
export function withAniListPriority<T>(priority: number, work: () => Promise<T>): Promise<T> {
  return priorityContext.run(priority, work);
}

/** The priority requests made here are queued at; see {@link withAniListPriority}. */
export function currentAniListPriority() {
  return priorityContext.getStore() ?? Number.NEGATIVE_INFINITY;
}

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
 * const { Page } = await anilist(AnimeCardsDocument, { ids: [21, 20], perPage: 2 }, { maxAgeMs: HOUR });
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
    // A viewer asking what a background job already queued should not wait at its priority.
    raisePriority(key, currentAniListPriority());
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
  const data = await rateLimited(key, () => execute(query, variables));
  const fetchedAt = new Date();
  const values = {
    operation: operationName(query),
    data,
    fetchedAt,
    expiresAt: new Date(fetchedAt.getTime() + options.maxAgeMs),
  };

  await db
    .insert(anilistSnapshot)
    .values({
      key,
      ...values,
    })
    .onConflictDoUpdate({
      target: anilistSnapshot.key,
      set: values,
    });

  // The envelope was validated; the payload shape is guaranteed by the schema.
  return data as TResult;
}

/**
 * Serializes upstream calls, sending the most urgent waiting one next; see
 * {@link withAniListPriority}, as soon as {@link waitToSend} allows.
 */
function rateLimited<T>(key: string, task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    enqueue({
      key,
      priority: currentAniListPriority(),
      send: () => task().then(resolve, reject),
    });
    void drain();
  });
}

/** Queues a request behind every one at least as urgent. */
function enqueue(request: QueuedRequest) {
  const later = waiting.findIndex((other) => other.priority > request.priority);
  waiting.splice(later === -1 ? waiting.length : later, 0, request);
  // A waiting viewer's request should not sit out a background one's wait.
  wake?.();
}

/**
 * Moves a queued request up to `priority` when that is more urgent, as when
 * a more urgent caller asks for the same thing. A request already sent is
 * left alone.
 */
function raisePriority(key: string, priority: number) {
  const index = waiting.findIndex((request) => request.key === key);
  const request = waiting[index];
  if (request && priority < request.priority) {
    waiting.splice(index, 1);
    enqueue({
      ...request,
      priority,
    });
  }
}

/**
 * An operation that loads AniList media by ID in pages of 50, AniList's cap,
 * each page an aliased `Page` field taking its own IDs. How many pages fit
 * in one request is bounded by AniList's query complexity limit of 500.
 */
export interface MediaByIdOperation<TResult, TVariables, TMedia extends {
  id: number;
}> {
  document: TypedDocumentString<TResult, TVariables>;
  /** How many pages of 50 IDs one request holds. */
  pages: number;
  /** The variables for IDs split into at most `pages` pages, the first never empty. */
  variables: (pages: readonly number[][]) => NoInfer<TVariables>;
  /** Every media a response holds, from all its pages. */
  media: (result: TResult) => Iterable<TMedia | null | undefined>;
}

/** IDs gathered into one request of a {@link loadMediaById} loader while it waits its turn. */
interface MediaBatch<TMedia> {
  key: string;
  priority: number;
  /** How many 429s it has waited out. */
  retries: number;
  wanted: Map<
    number,
    {
      resolve: (media: TMedia | null) => void;
      reject: (cause: unknown) => void;
    }
  >;
}

const mediaPageSize = 50;
let mediaBatchCount = 0;

/**
 * How many AniList 429s one batch waits out before failing its callers.
 * Walking franchises needs bursts of requests and AniList often runs at its
 * degraded limit of 30 per minute, but a 429 only pauses the queue.
 */
const mediaBatchRetries = 3;

/**
 * Creates a loader of AniList media by ID that shares requests between
 * callers.
 *
 * IDs are gathered into a request queued like any other, and every ID asked
 * for while it waits for its turn under the rate limit joins it, up to
 * `operation.pages` pages of 50. Callers that start at about the same time,
 * as the layouts of the titles one search found do, then share requests
 * rather than spend AniList's small budget each on their own. The request
 * is sent at the most urgent priority among its callers', so a viewer's IDs
 * never wait for a background job's; the background IDs simply come along.
 *
 * Responses are not cached; an ID already queued or being fetched shares
 * that request. A request AniList answers with a 429 is queued again, to
 * go once the pause that follows ends, rather than failing its callers.
 *
 * @returns A function resolving to the media AniList has among `ids`, by
 *   ID; unknown IDs are left out.
 * @throws {@link UpstreamUnavailableError} from the returned function when
 *   AniList fails, or keeps answering with 429s.
 */
export function loadMediaById<TResult, TVariables, TMedia extends {
  id: number;
}>(
  operation: MediaByIdOperation<TResult, TVariables, TMedia>
) {
  const capacity = operation.pages * mediaPageSize;
  const query = operation.document.toString();
  const name = operationName(query);
  /** IDs queued or being fetched, each settling with its media, or `null` when AniList has none. */
  const loading = new Map<number, Promise<TMedia | null>>();
  /** The batch each queued ID waits in, until it is sent. */
  const queuedIn = new Map<number, MediaBatch<TMedia>>();
  /** The batch new IDs join, until it is full or sent. */
  let open: MediaBatch<TMedia> | null = null;

  function load(id: number, priority: number) {
    const pending = loading.get(id);
    if (pending) {
      raise(queuedIn.get(id), priority);
      return pending;
    }

    const loaded = new Promise<TMedia | null>((resolve, reject) => {
      const batch = open ?? openBatch(priority);
      batch.wanted.set(id, {
        resolve,
        reject,
      });
      queuedIn.set(id, batch);
      raise(batch, priority);
      if (batch.wanted.size >= capacity) {
        open = null;
      }
    }).finally(() => {
      loading.delete(id);
    });
    loading.set(id, loaded);
    return loaded;
  }

  function openBatch(priority: number) {
    const batch: MediaBatch<TMedia> = {
      key: `${name}:${(mediaBatchCount += 1)}`,
      priority,
      retries: 0,
      wanted: new Map(),
    };
    open = batch;
    queue(batch);
    return batch;
  }

  function queue(batch: MediaBatch<TMedia>) {
    enqueue({
      key: batch.key,
      priority: batch.priority,
      send: () => send(batch),
    });
    // Once the current task is done, so IDs asked for alongside join even
    // when the request could go at once.
    queueMicrotask(() => void drain());
  }

  function raise(batch: MediaBatch<TMedia> | undefined, priority: number) {
    if (batch && priority < batch.priority) {
      batch.priority = priority;
      raisePriority(batch.key, priority);
    }
  }

  async function send(batch: MediaBatch<TMedia>) {
    if (open === batch) {
      open = null;
    }

    const ids = [...batch.wanted.keys()].sort((left, right) => left - right);
    for (const id of ids) {
      queuedIn.delete(id);
    }

    try {
      const pages = Array.from({
        length: Math.ceil(ids.length / mediaPageSize),
      }, (_, page) =>
        ids.slice(page * mediaPageSize, (page + 1) * mediaPageSize)
      );
      // The envelope was validated; the payload shape is guaranteed by the schema.
      const data = (await execute(query, operation.variables(pages))) as TResult;
      const found = new Map<number, TMedia>();
      for (const media of operation.media(data)) {
        if (media) {
          found.set(media.id, media);
        }
      }

      for (const [id, { resolve }] of batch.wanted) {
        resolve(found.get(id) ?? null);
      }
    } catch (cause) {
      const isRateLimited = cause instanceof UpstreamUnavailableError && cause.retryAfterMs !== null;
      if (isRateLimited && batch.retries < mediaBatchRetries) {
        batch.retries += 1;
        for (const id of ids) {
          queuedIn.set(id, batch);
        }
        queue(batch);
        return;
      }

      for (const { reject } of batch.wanted.values()) {
        reject(cause);
      }
    }
  }

  return async (ids: Iterable<number>): Promise<Map<number, TMedia>> => {
    const priority = currentAniListPriority();
    const unique = [...new Set(ids)];
    const loaded = await Promise.all(unique.map((id) => load(id, priority)));
    return new Map(unique.flatMap((id, index) => {
      const media = loaded[index];
      return media ? [[id, media] as const] : [];
    }));
  };
}

/** Ends the drain loop's current wait early; set while it waits. */
let wake: (() => void) | null = null;

async function drain() {
  if (isDraining) {
    return;
  }

  isDraining = true;
  while (waiting.length > 0) {
    // Picked only once its turn comes, so a more urgent request queued
    // during the wait goes first.
    const [next] = waiting;
    const wait = next ? waitToSend(next.priority, Date.now(), limiterState()) : 0;
    if (wait > 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, wait);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      wake = null;
      continue;
    }

    const request = waiting.shift();
    const sentAt = Date.now();
    recentSends = [...recentSends.filter((earlier) => earlier > sentAt - minuteMs), sentAt];
    // Counted until AniList's response reports the budget itself.
    if (budget && sentAt < budget.resetAt) {
      budget = {
        ...budget,
        remaining: budget.remaining - 1,
      };
    }
    await request?.send();
  }

  isDraining = false;
}

/**
 * What is left of AniList's budget for this IP: `remaining` requests until
 * `resetAt`, when a new minute's budget starts. AniList counts a fixed
 * window a minute long; it does not refill as time passes.
 */
export interface Budget {
  remaining: number;
  resetAt: number;
}

/** What decides when the next AniList request may be sent. */
export interface LimiterState {
  /** Requests per minute AniList allows. */
  limit: number;
  /** When this process sent each request of the last minute, oldest first. */
  recentSends: readonly number[];
  /** When any request may be sent again, after a 429. */
  pausedUntil: number;
  /** What AniList last reported; `null` before it has. */
  budget: Budget | null;
}

function limiterState(): LimiterState {
  return {
    limit: requestLimit,
    recentSends,
    pausedUntil: nextRequestAt,
    budget,
  };
}

/**
 * How long a request at `priority` must wait before it may be sent at `now`,
 * in milliseconds: until a pause after a 429 ends, its spacing has passed,
 * and the part of the budget it may use has a request left. Background
 * requests leave the {@link viewerReserve} alone; requests a viewer waits on
 * may use all of it, {@link viewerSpacingMs} apart.
 *
 * AniList allows `limit` requests in any 60 s, however they fall into the
 * minutes its `X-RateLimit-Remaining` counts, so the requests this process
 * sent in the last 60 s bound the budget as well as that header, which also
 * counts other processes on the same IP.
 */
export function waitToSend(priority: number, now: number, state: LimiterState) {
  const isViewerWaiting = priority <= viewerWaitingPriority;
  const spacing = isViewerWaiting ? viewerSpacingMs : spacingFor(state.limit);
  const floor = isViewerWaiting ? 0 : viewerReserve;
  const recent = state.recentSends.filter((sentAt) => sentAt > now - minuteMs);
  const lastSentAt = recent.at(-1) ?? Number.NEGATIVE_INFINITY;

  // Enough of the oldest recent requests must leave the last 60 s to bring
  // them under the budget this request may use.
  const excess = recent.length - (state.limit - floor - 1);
  const windowWait = excess > 0 ? (recent[excess - 1] ?? now) + minuteMs - now : 0;
  const reportedWait =
    state.budget && now < state.budget.resetAt && state.budget.remaining <= floor ? state.budget.resetAt - now : 0;

  return Math.max(0, state.pausedUntil - now, lastSentAt + spacing - now, windowWait, reportedWait);
}

const minuteMs = 60_000;

/**
 * The budget after AniList reports `remaining` at `now`. A count higher
 * than expected means a new window started, at the latest now, so it ends
 * a minute from now at the latest; that bound is kept, since resetting
 * early would send into a spent budget.
 */
export function followBudget(previous: Budget | null, remaining: number, now: number): Budget {
  const isNewWindow = !previous || now >= previous.resetAt || remaining > previous.remaining;
  return {
    remaining,
    resetAt: isNewWindow ? now + 60_000 : previous.resetAt,
  };
}

/**
 * Follows the per-minute limit and remaining budget AniList reports in its
 * `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers.
 *
 * The limit is per IP, so an API and a scheduler on one host share it; the
 * budget each reads back includes the other's requests, and the 429
 * handling in `execute` covers the rest.
 */
function followRateLimit(response: Response) {
  const limit = Number(response.headers.get("x-ratelimit-limit"));
  if (Number.isInteger(limit) && limit > 0) {
    requestLimit = limit;
  }

  const remaining = Number(response.headers.get("x-ratelimit-remaining"));
  if (response.headers.has("x-ratelimit-remaining") && Number.isInteger(remaining) && remaining >= 0) {
    budget = followBudget(budget, remaining, Date.now());
  }
}

/** Spacing between background requests: the per-minute limit spread evenly, with a margin for jitter. */
function spacingFor(limit: number) {
  return Math.ceil(60_000 / limit) + 100;
}

async function execute(query: string, variables: unknown) {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables,
      }),
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch (cause) {
    throw new UpstreamUnavailableError("AniList could not be reached", {
      retryAfterMs: null,
      cause,
    });
  }

  followRateLimit(response);

  if (response.status === 429) {
    const retryAfterMs = retryAfter(response) ?? 60_000;
    // Pause every queued request, not just this one.
    nextRequestAt = Math.max(nextRequestAt, Date.now() + retryAfterMs);
    budget = {
      remaining: 0,
      resetAt: Date.now() + retryAfterMs,
    };
    throw new UpstreamUnavailableError("AniList rate limit reached", {
      retryAfterMs,
    });
  }

  const body = EnvelopeSchema.safeParse(await response.json().catch(() => null));
  if (!body.success) {
    throw new UpstreamUnavailableError(`AniList returned an invalid ${response.status} response`, {
      retryAfterMs: null,
      cause: body.error,
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
      retryAfterMs: retryAfter(response),
    }
  );
}

/**
 * How long AniList asks to wait, from `Retry-After`. It sometimes answers a
 * 429 with `Retry-After: 0`, meaning now; a second is waited then, so as not
 * to answer it with a burst.
 */
function retryAfter(response: Response) {
  const header = response.headers.get("Retry-After");
  const seconds = header === null ? Number.NaN : Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.max(seconds, 1) * 1_000 : null;
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
