import { describe, expect, mock, test } from "bun:test";

import type { ProviderHealth } from "@sora/core/playback";

// The real module reads the core's configuration on import; every test here
// passes its own loader.
mock.module("@sora/core/playback", () => ({
  getProviderHealth: async () => []
}));

const { healthRoutes } = await import("./health");

const anikoto: ProviderHealth = {
  provider: "anikoto",
  status: "failing",
  lastOkAt: "2026-09-25T12:00:00.000Z",
  lastError: "MegaPlay has no dub source for this episode",
  lastErrorAt: "2026-09-25T16:20:00.000Z",
  operations: [
    {
      operation: "resolve_stream",
      ok: 0,
      empty: 0,
      failed: 4,
      averageMs: 250
    }
  ]
};

async function probe(routes: ReturnType<typeof healthRoutes>) {
  const response = await routes.request("/");
  return {
    status: response.status,
    body: (await response.json()) as {
      status: string;
      providers: unknown[] | null;
    }
  };
}

describe("/health", () => {
  test("stays ok while a provider fails, and reports providers in snake_case without error messages", async () => {
    const { status, body } = await probe(healthRoutes(async () => [anikoto]));

    expect(status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      providers: [
        {
          provider: "anikoto",
          status: "failing",
          last_ok_at: "2026-09-25T12:00:00.000Z",
          last_error_at: "2026-09-25T16:20:00.000Z",
          operations: [
            {
              operation: "resolve_stream",
              ok: 0,
              empty: 0,
              failed: 4,
              average_ms: 250
            }
          ]
        }
      ]
    });
  });

  test("reads provider health once for probes within a minute", async () => {
    let loads = 0;
    const routes = healthRoutes(async () => {
      loads += 1;
      return [anikoto];
    });

    await probe(routes);
    await probe(routes);

    expect(loads).toBe(1);
  });

  test("stays ok without providers when their health cannot be read, and tries again next probe", async () => {
    let loads = 0;
    const routes = healthRoutes(async () => {
      loads += 1;
      if (loads === 1) {
        throw new Error("database is down");
      }
      return [anikoto];
    });

    expect(await probe(routes)).toEqual({
      status: 200,
      body: {
        status: "ok",
        providers: null
      }
    });
    expect((await probe(routes)).body.providers).toHaveLength(1);
  });
});
