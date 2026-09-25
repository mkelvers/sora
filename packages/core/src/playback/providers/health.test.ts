import { describe, expect, test } from "bun:test";

import { summarizeHealth, type OperationRow } from "./health";

const now = new Date("2026-09-25T16:40:00Z");
const hoursAgo = (hours: number) => new Date(Date.UTC(2026, 8, 25, 16 - hours));

/** A row for `provider`'s `operation` with no calls and nothing on record, overridden by `fields`. */
function row(provider: string, operation: string, fields: Partial<OperationRow>): OperationRow {
  return {
    provider,
    operation,
    ok: 0,
    empty: 0,
    failed: 0,
    durationMs: 0,
    lastOkHour: null,
    recentCalls: 0,
    lastError: null,
    lastErrorAt: null,
    ...fields
  };
}

const statusOf = (rows: OperationRow[]) => summarizeHealth(["anikoto"], rows, now)[0]?.status;

describe("summarizeHealth", () => {
  test("calls a provider ok when a call succeeded within three hours", () => {
    expect(
      statusOf([
        row("anikoto", "resolve_stream", {
          ok: 1,
          failed: 4,
          lastOkHour: hoursAgo(3),
          recentCalls: 5
        })
      ])
    ).toBe("ok");
  });

  test("calls a provider failing when five calls in three hours brought no success", () => {
    expect(
      statusOf([
        row("anikoto", "resolve_stream", {
          ok: 3,
          failed: 9,
          lastOkHour: hoursAgo(4),
          recentCalls: 5
        })
      ])
    ).toBe("failing");
  });

  test("counts a provider that only comes back empty as failing, as a scraper whose site changed does", () => {
    expect(
      statusOf([
        row("anikoto", "find_media", {
          empty: 20,
          recentCalls: 20
        })
      ])
    ).toBe("failing");
  });

  test("adds up calls across operations", () => {
    expect(
      statusOf([
        row("anikoto", "find_media", {
          recentCalls: 3
        }),
        row("anikoto", "resolve_stream", {
          recentCalls: 2
        })
      ])
    ).toBe("failing");
  });

  test("calls a provider idle when a quiet stretch only asked it for a few titles it lacks", () => {
    expect(
      statusOf([
        row("anikoto", "find_media", {
          empty: 4,
          lastOkHour: hoursAgo(6),
          recentCalls: 4
        })
      ])
    ).toBe("idle");
  });

  test("calls a provider idle when it has not been called for three hours", () => {
    expect(
      statusOf([
        row("anikoto", "resolve_stream", {
          failed: 20,
          recentCalls: 0
        })
      ])
    ).toBe("idle");
    expect(statusOf([])).toBe("idle");
  });

  test("lists every provider in order, even ones never called, and ignores others", () => {
    const health = summarizeHealth(
      ["anikoto", "megaplay"],
      [
        row("removed", "resolve_stream", {
          ok: 1,
          lastOkHour: hoursAgo(0)
        }),
        row("megaplay", "resolve_stream", {
          ok: 1,
          lastOkHour: hoursAgo(0)
        })
      ],
      now
    );

    expect(health.map((provider) => `${provider.provider}:${provider.status}`)).toEqual(["anikoto:idle", "megaplay:ok"]);
  });

  test("reports the latest success and error across operations", () => {
    const [health] = summarizeHealth(
      ["anikoto"],
      [
        row("anikoto", "list_episodes", {
          lastOkHour: hoursAgo(2),
          lastError: "older",
          lastErrorAt: new Date("2026-09-25T15:10:00Z")
        }),
        row("anikoto", "resolve_stream", {
          lastOkHour: hoursAgo(5),
          lastError: "MegaPlay has no dub source for this episode",
          lastErrorAt: new Date("2026-09-25T16:20:00Z")
        })
      ],
      now
    );

    expect(health).toMatchObject({
      lastOkAt: "2026-09-25T14:00:00.000Z",
      lastError: "MegaPlay has no dub source for this episode",
      lastErrorAt: "2026-09-25T16:20:00.000Z"
    });
  });

  test("summarizes each operation called in the last day, with its mean duration", () => {
    const [health] = summarizeHealth(
      ["anikoto"],
      [
        row("anikoto", "resolve_stream", {
          ok: 3,
          empty: 0,
          failed: 1,
          durationMs: 1_000,
          lastOkHour: hoursAgo(0)
        }),
        // Called only before the last day: still counts toward the latest success.
        row("anikoto", "find_media", {
          lastOkHour: hoursAgo(30)
        })
      ],
      now
    );

    expect(health?.operations).toEqual([
      {
        operation: "resolve_stream",
        ok: 3,
        empty: 0,
        failed: 1,
        averageMs: 250
      }
    ]);
  });
});
