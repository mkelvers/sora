import { OpenAPIHono } from "@hono/zod-openapi";
import { getGenres } from "@sora/core/catalog";
import { proxyStream, resolvePlayback } from "@sora/core/playback";
import {
  browseSeries,
  getAdjacentEpisodes,
  getAiringSchedule,
  getSeason,
  getSeasonEpisodes,
  getSeries,
  type EpisodeAddress
} from "@sora/core/series";
import { cors } from "hono/cors";

import { onInvalidRequest } from "./errors";
import { pageMeta, snakeCased } from "./openapi/envelope";
import * as route from "./openapi/routes";

const day = 24 * 60 * 60 * 1_000;

/**
 * Version 1 of the API: the handlers for the contracts in `openapi/routes.ts`.
 * Every successful JSON response is `{ results, meta }`: the core's models,
 * in snake_case, under `results`, and facts about the response, such as
 * paging or the IDs it is for, under `meta`.
 *
 * A breaking change to any route belongs in a new version mounted next to
 * this one, never here: deployed clients keep calling `/v1`.
 */
export const v1 = new OpenAPIHono({
  defaultHook: onInvalidRequest
});

// Browser players (hls.js, subtitle tracks) fetch streams directly.
v1.use(route.getStream.getRoutingPath(), cors());

/** A playback's URL, relative to the API's origin. */
function playbackPath(animeId: string, { seasonId, episode }: EpisodeAddress) {
  return `/v1/anime/${animeId}/seasons/${seasonId}/episodes/${episode}/playback`;
}

export const v1Routes = v1
  .openapi(route.browseSeries, async (c) => {
    const { season_year, per_page, ...filters } = c.req.valid("query");
    const page = await browseSeries({
      ...filters,
      seasonYear: season_year,
      perPage: per_page
    });
    c.header("Cache-Control", "public, max-age=300");
    return c.json(
      {
        results: snakeCased(page.items),
        meta: pageMeta(c.req.url, page)
      },
      200
    );
  })

  .openapi(route.searchSeries, async (c) => {
    const { q, season_year, per_page, ...filters } = c.req.valid("query");
    const page = await browseSeries({
      ...filters,
      seasonYear: season_year,
      perPage: per_page,
      search: q
    });
    c.header("Cache-Control", "public, max-age=60");
    return c.json(
      {
        results: snakeCased(page.items),
        meta: pageMeta(c.req.url, page)
      },
      200
    );
  })

  .openapi(route.getSeries, async (c) => {
    const series = await getSeries(c.req.valid("param").anime_id);
    c.header("Cache-Control", "public, max-age=300");
    return c.json(
      {
        results: snakeCased(series),
        meta: {}
      },
      200
    );
  })

  .openapi(route.getSeason, async (c) => {
    const { anime_id, season_id } = c.req.valid("param");
    const season = await getSeason(anime_id, season_id);
    c.header("Cache-Control", "public, max-age=300");
    return c.json(
      {
        results: snakeCased(season),
        meta: {
          anime_id
        }
      },
      200
    );
  })

  .openapi(route.listSeasonEpisodes, async (c) => {
    const { anime_id, season_id } = c.req.valid("param");
    const episodes = await getSeasonEpisodes(anime_id, season_id);
    // Unknown audio is filled in once providers are looked up.
    c.header("Cache-Control", episodes.some((episode) => episode.audio === null) ? "no-store" : "public, max-age=300");
    return c.json(
      {
        results: snakeCased(episodes),
        meta: {
          anime_id,
          season_id,
          count: episodes.length
        }
      },
      200
    );
  })

  .openapi(route.listGenres, async (c) => {
    const genres = await getGenres();
    c.header("Cache-Control", "public, max-age=86400");
    return c.json(
      {
        results: genres,
        meta: {
          count: genres.length
        }
      },
      200
    );
  })

  .openapi(route.getSchedule, async (c) => {
    const query = c.req.valid("query");
    const from = query.from ? new Date(query.from) : new Date();
    const until = query.until ? new Date(query.until) : new Date(from.getTime() + 7 * day);
    const episodes = await getAiringSchedule(from, until);
    c.header("Cache-Control", "public, max-age=60");
    return c.json(
      {
        results: snakeCased(episodes),
        meta: {
          from: from.toISOString(),
          until: until.toISOString(),
          count: episodes.length
        }
      },
      200
    );
  })

  .openapi(route.getPlayback, async (c) => {
    const { anime_id, season_id, episode } = c.req.valid("param");
    // Absolute, so players on any origin can fetch it.
    const streamBaseUrl = new URL("/v1/streams", c.req.url);
    // Behind a TLS-terminating proxy the API itself is reached over HTTP.
    const protocol = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
    if (protocol === "https" || protocol === "http") {
      streamBaseUrl.protocol = protocol;
    }

    const [playback, adjacent] = await Promise.all([
      resolvePlayback(
        {
          animeId: anime_id,
          seasonId: season_id,
          episode
        },
        {
          streamBaseUrl: streamBaseUrl.href
        }
      ),
      getAdjacentEpisodes(anime_id, season_id, episode)
    ]);
    // Stream URLs expire; a cached playback would hand out dead ones.
    c.header("Cache-Control", "no-store");
    return c.json(
      {
        results: snakeCased(playback.media),
        meta: {
          anime_id,
          season_id,
          episode,
          expires_at: playback.expiresAt,
          next: adjacent.next && playbackPath(anime_id, adjacent.next),
          previous: adjacent.previous && playbackPath(anime_id, adjacent.previous)
        }
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
      "Anime titles laid out like a streaming service: one title per show with its seasons, OVAs, and related films, addressed by Sora's own IDs. Every field and query parameter is in snake_case. A successful JSON response is `{ results, meta }`: what was asked for under `results`, an object for one resource and an array for a list, and facts about the response under `meta`, such as paging with `next` and `previous` links. Errors are RFC 9457 problems (`application/problem+json`) with a stable `code`."
  },
  servers: [
    {
      url: "/v1"
    }
  ]
});
