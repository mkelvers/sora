import { OpenAPIHono } from "@hono/zod-openapi";
import { getGenres } from "@sora/core/catalog";
import { getSkipTimes, proxyStream, resolvePlayback } from "@sora/core/playback";
import { browseSeries, getAiringSchedule, getSeason, getSeasonEpisodes, getSeries } from "@sora/core/series";
import { cors } from "hono/cors";

import { onInvalidRequest } from "./errors";
import * as route from "./openapi/routes";

const day = 24 * 60 * 60 * 1_000;

/**
 * Version 1 of the API: the handlers for the contracts in `openapi/routes.ts`.
 * Responses are the core's models, unchanged; lists are wrapped as
 * `{ items }` so fields can be added without breaking clients.
 *
 * A breaking change to any route belongs in a new version mounted next to
 * this one, never here: deployed clients keep calling `/v1`.
 */
export const v1 = new OpenAPIHono({
  defaultHook: onInvalidRequest
});

// Browser players (hls.js, subtitle tracks) fetch streams directly.
v1.use(route.getStream.getRoutingPath(), cors());

export const v1Routes = v1
  .openapi(route.browseSeries, async (c) => {
    const page = await browseSeries(c.req.valid("query"));
    c.header("Cache-Control", "public, max-age=300");
    return c.json(page, 200);
  })

  .openapi(route.searchSeries, async (c) => {
    const { q, ...filters } = c.req.valid("query");
    const page = await browseSeries({
      ...filters,
      search: q
    });
    c.header("Cache-Control", "public, max-age=60");
    return c.json(page, 200);
  })

  .openapi(route.getSeries, async (c) => {
    const series = await getSeries(c.req.valid("param").animeId);
    c.header("Cache-Control", "public, max-age=300");
    return c.json(series, 200);
  })

  .openapi(route.getSeason, async (c) => {
    const { animeId, seasonId } = c.req.valid("param");
    const season = await getSeason(animeId, seasonId);
    c.header("Cache-Control", "public, max-age=300");
    return c.json(season, 200);
  })

  .openapi(route.listSeasonEpisodes, async (c) => {
    const { animeId, seasonId } = c.req.valid("param");
    const items = await getSeasonEpisodes(animeId, seasonId);
    // Unknown audio is filled in once providers are looked up.
    c.header("Cache-Control", items.some((episode) => episode.audio === null) ? "no-store" : "public, max-age=300");
    return c.json(
      {
        items
      },
      200
    );
  })

  .openapi(route.listGenres, async (c) => {
    const items = await getGenres();
    c.header("Cache-Control", "public, max-age=86400");
    return c.json(
      {
        items
      },
      200
    );
  })

  .openapi(route.getSchedule, async (c) => {
    const query = c.req.valid("query");
    const from = query.from ? new Date(query.from) : new Date();
    const until = query.until ? new Date(query.until) : new Date(from.getTime() + 7 * day);
    const items = await getAiringSchedule(from, until);
    c.header("Cache-Control", "public, max-age=60");
    return c.json(
      {
        items
      },
      200
    );
  })

  .openapi(route.getPlayback, async (c) => {
    const playback = await resolvePlayback(c.req.valid("param"));
    // Stream tokens expire; a cached playback would hand out dead ones.
    c.header("Cache-Control", "no-store");
    return c.json(playback, 200);
  })

  .openapi(route.getSkipTimes, async (c) => {
    const { animeId, seasonId, episode } = c.req.valid("param");
    const items = await getSkipTimes(animeId, seasonId, episode, c.req.valid("query").duration);
    c.header("Cache-Control", "public, max-age=3600");
    return c.json(
      {
        items
      },
      200
    );
  })

  .openapi(route.getStream, (c) =>
    proxyStream(c.req.valid("param").token, {
      range: c.req.header("range") ?? null,
      signal: c.req.raw.signal
    })
  );

v1.doc31("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Sora API",
    version: "1",
    description:
      "Anime titles laid out like a streaming service: one title per show with its seasons, OVAs, and related films, addressed by Sora's own IDs. Errors are RFC 9457 problems (`application/problem+json`) with a stable `code`."
  },
  servers: [
    {
      url: "/v1"
    }
  ]
});
