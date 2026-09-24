import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { clientAddress } from "./client";
import { ProblemError } from "./problem";
import type { AppEnv } from "./session";

/** How one limit counts requests. Each limit keeps its own counters. */
export interface RateLimitOptions {
  /** Requests allowed per window. */
  limit: number;
  windowMs: number;
  /** Who is being limited: a user ID or a client address. */
  key: (c: Context<AppEnv>) => string;
}

/** Counters are swept this often, so idle clients do not accumulate. */
const sweepIntervalMs = 60_000;

/**
 * Creates a fixed-window rate limit.
 *
 * Every response carries `RateLimit-Limit`, `RateLimit-Remaining`, and
 * `RateLimit-Reset` (seconds until the window resets). A request over the
 * limit is answered 429 `RATE_LIMITED` with `Retry-After`.
 *
 * @remarks
 * Counters live in this process's memory, so each API instance limits on
 * its own: with several instances, a client may make up to `limit` requests
 * per instance. That is enough to stop runaway clients and scraping; exact
 * limits across instances would need a shared store.
 */
export function rateLimit(options: RateLimitOptions) {
  const windows = new Map<
    string,
    {
      count: number;
      resetAt: number;
    }
  >();

  let nextSweepAt = Date.now() + sweepIntervalMs;

  return createMiddleware<AppEnv>(async (c, next) => {
    const now = Date.now();
    if (now >= nextSweepAt) {
      for (const [key, window] of windows) {
        if (window.resetAt <= now) {
          windows.delete(key);
        }
      }

      nextSweepAt = now + sweepIntervalMs;
    }

    const key = options.key(c);
    let window = windows.get(key);
    if (!window || window.resetAt <= now) {
      window = {
        count: 0,
        resetAt: now + options.windowMs
      };
      windows.set(key, window);
    }

    window.count += 1;
    const resetSeconds = Math.max(Math.ceil((window.resetAt - now) / 1_000), 1);
    const headers = {
      "RateLimit-Limit": String(options.limit),
      "RateLimit-Remaining": String(Math.max(options.limit - window.count, 0)),
      "RateLimit-Reset": String(resetSeconds)
    };

    if (window.count > options.limit) {
      throw new ProblemError(429, "RATE_LIMITED", `Too many requests; try again in ${resetSeconds} seconds`, {
        ...headers,
        "Retry-After": String(resetSeconds)
      });
    }

    await next();
    for (const [name, value] of Object.entries(headers)) {
      c.header(name, value);
    }
  });
}

const minute = 60_000;

/** Searching and browsing can lay out new titles, which costs upstream requests. */
export const browseLimit = rateLimit({
  limit: 60,
  windowMs: minute,
  key: clientAddress
});

/** Reading titles, episodes, genres, the schedule, and skip times. */
export const catalogLimit = rateLimit({
  limit: 300,
  windowMs: minute,
  key: clientAddress
});

/** Resolving playback scrapes third-party providers. Runs after `requireUser`. */
export const playbackLimit = rateLimit({
  limit: 30,
  windowMs: minute,
  key: (c) => c.var.user.id
});

/** The user's library; players save progress every few seconds. Runs after `requireUser`. */
export const libraryLimit = rateLimit({
  limit: 240,
  windowMs: minute,
  key: (c) => c.var.user.id
});
