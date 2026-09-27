import { describe, expect, test } from "bun:test";

import { followBudget, viewerWaitingPriority, waitToSend, type LimiterState } from "./client";

const background = 10;
const now = 1_000_000;

/** `count` requests sent `gapMs` apart, the last `lastAgoMs` before now, oldest first. */
function sends(count: number, gapMs: number, lastAgoMs = gapMs) {
  return Array.from({ length: count }, (_, index) => now - lastAgoMs - (count - 1 - index) * gapMs);
}

/** AniList degraded to 30 a minute, with this process's `recentSends` and nothing else known. */
function degraded(recentSends: readonly number[], overrides: Partial<LimiterState> = {}): LimiterState {
  return {
    limit: 30,
    recentSends,
    pausedUntil: 0,
    budget: null,
    ...overrides
  };
}

describe("waitToSend", () => {
  test("sends a viewer's request at once while the last minute has room", () => {
    expect(waitToSend(viewerWaitingPriority, now, degraded(sends(27, 2_000)))).toBe(0);
  });

  test("lets a viewer's request use the room background work leaves alone", () => {
    const state = degraded(sends(25, 2_000));

    expect(waitToSend(viewerWaitingPriority, now, state)).toBe(0);
    expect(waitToSend(background, now, state)).toBeGreaterThan(0);
  });

  test("holds a viewer's request once 30 went out in the last 60 s, as AniList then answers 429", () => {
    // As logged: 29 requests in the minute before, and the 30th was refused.
    const recent = sends(30, 1_900, 100);

    expect(waitToSend(viewerWaitingPriority, now, degraded(recent))).toBe((recent[0] ?? 0) + 60_000 - now);
  });

  test("holds background requests while fewer than the reserve's worth of room is left", () => {
    // 19 in the last minute leaves 11: one for background work above the 10 kept for viewers.
    expect(waitToSend(background, now, degraded(sends(19, 3_000)))).toBe(0);
    expect(waitToSend(background, now, degraded(sends(20, 2_900)))).toBeGreaterThan(0);
  });

  test("lets a request through as soon as the oldest one leaves the last minute", () => {
    const recent = sends(30, 2_000, 100);
    const wait = waitToSend(viewerWaitingPriority, now, degraded(recent));

    expect(waitToSend(viewerWaitingPriority, now + wait, degraded(recent))).toBe(0);
  });

  test("keeps a viewer's requests a little apart, for AniList's burst limit", () => {
    expect(waitToSend(viewerWaitingPriority, now, degraded([now - 100]))).toBe(900);
  });

  test("spaces background requests to the per-minute limit, even with room left", () => {
    // 60 s / 30 plus the 100 ms margin, 1 s of which has passed.
    expect(waitToSend(background, now, degraded([now - 1_000]))).toBe(1_100);
  });

  test("respects what AniList reports left, which counts other processes too", () => {
    const state = degraded([], {
      budget: { remaining: 0, resetAt: now + 20_000 }
    });

    expect(waitToSend(viewerWaitingPriority, now, state)).toBe(20_000);
  });

  test("keeps background requests from spending what AniList reports is left of the reserve", () => {
    const state = degraded([], {
      budget: { remaining: 10, resetAt: now + 20_000 }
    });

    expect(waitToSend(viewerWaitingPriority, now, state)).toBe(0);
    expect(waitToSend(background, now, state)).toBe(20_000);
  });

  test("treats requests made outside any priority as a waiting viewer's", () => {
    expect(waitToSend(Number.NEGATIVE_INFINITY, now, degraded(sends(25, 2_000)))).toBe(0);
  });

  test("waits out a pause after a 429 whoever is waiting", () => {
    const state = degraded([], { pausedUntil: now + 29_000 });

    expect(waitToSend(viewerWaitingPriority, now, state)).toBe(29_000);
    expect(waitToSend(background, now, state)).toBe(29_000);
  });
});

describe("followBudget", () => {
  test("keeps the window's end while the count goes down", () => {
    expect(followBudget({ remaining: 11, resetAt: now + 30_000 }, 10, now)).toEqual({
      remaining: 10,
      resetAt: now + 30_000
    });
  });

  test("starts a new window a minute long when the count goes back up", () => {
    expect(followBudget({ remaining: 0, resetAt: now + 30_000 }, 29, now)).toEqual({
      remaining: 29,
      resetAt: now + 60_000
    });
  });

  test("starts a new window after the last one ended", () => {
    expect(followBudget({ remaining: 5, resetAt: now - 1 }, 3, now).resetAt).toBe(now + 60_000);
  });

  test("assumes the first window reported ends a minute later at the latest", () => {
    expect(followBudget(null, 17, now)).toEqual({
      remaining: 17,
      resetAt: now + 60_000
    });
  });
});
