import { getProviderHealth, type ProviderHealth } from "@sora/core/playback";
import { Hono } from "hono";

import { snakeCased } from "./openapi/envelope";

/** Load balancers probe often; provider health is read at most this often per instance. */
const cacheMs = 60_000;

/**
 * `/health`: always `200` with `status: "ok"` while the process serves
 * requests, so load balancers keep it in rotation, plus how each stream
 * provider has been doing.
 *
 * A failing provider does not make the API unhealthy: playback falls back to
 * the others, and taking instances out of rotation would not fix a scraper.
 * `providers` is `null` when provider health cannot be read.
 *
 * The endpoint is public, so errors are reported by time only: their
 * messages come from scrapers and can quote upstream URLs and pages. They
 * are in `provider_calls` and the scheduler's warnings.
 */
export function healthRoutes(load: () => Promise<ProviderHealth[]> = getProviderHealth) {
  let cached: { at: number; providers: Promise<ProviderHealth[] | null> } | null = null;

  const providers = () => {
    if (!cached || Date.now() - cached.at >= cacheMs) {
      cached = {
        at: Date.now(),
        providers: load().catch((error: unknown) => {
          console.warn(`Could not read provider health: ${String(error)}`);
          // Not cached: the next probe tries again.
          cached = null;
          return null;
        })
      };
    }
    return cached.providers;
  };

  return new Hono().get("/", async (c) => {
    const health = await providers();
    return c.json({
      status: "ok",
      providers: health && snakeCased(health.map(({ lastError: _lastError, ...provider }) => provider))
    });
  });
}
