import { createRoute, z } from "@hono/zod-openapi";
import { getSkipTimes, proxyStream, resolvePlayback } from "@sora/core/playback";

import { catalogLimit, playbackLimit } from "../http/rate-limit";
import { createRouter, publicCache } from "../http/router";
import { requireUser } from "../http/session";
import { EpisodeNumberParam, itemsOf, json, problem, SeasonIdParam, signedIn, tooManyRequests } from "../schemas/common";
import { LanguageSchema, PlaybackSchema, SkipSegmentSchema } from "../schemas/playback";

const EpisodeParams = z.object({
  seasonId: SeasonIdParam,
  episode: EpisodeNumberParam
});

const playbackRoute = createRoute({
  method: "get",
  path: "/seasons/{seasonId}/episodes/{episode}/playback",
  tags: ["Playback"],
  summary: "Get streams for an episode",
  description:
    "Resolves streams from the first provider that can play the episode. Sources and subtitles are stream tokens for `GET /streams/{token}`; they expire, so resolve again rather than storing them.",
  security: signedIn,
  middleware: [
    requireUser,
    playbackLimit
  ],
  request: {
    params: EpisodeParams,
    query: z.object({
      language: LanguageSchema.default("sub")
    })
  },
  responses: {
    200: json(PlaybackSchema, "Streams for the episode."),
    401: problem("Not signed in."),
    404: problem("No such season or episode, or nothing streams it."),
    429: tooManyRequests,
    502: problem("Providers list the episode but none can stream it right now.")
  }
});

const skipTimesRoute = createRoute({
  method: "get",
  path: "/seasons/{seasonId}/episodes/{episode}/skip-times",
  middleware: catalogLimit,
  tags: ["Playback"],
  summary: "Get opening, ending, and recap times",
  description: "Crowd-sourced from AniSkip. An empty list means nothing is known.",
  request: {
    params: EpisodeParams,
    query: z.object({
      duration: z.coerce.number().positive().optional().openapi({
        description: "The playing stream's duration in seconds; narrows results to encodes of similar length."
      })
    })
  },
  responses: {
    429: tooManyRequests,
    200: json(itemsOf(SkipSegmentSchema), "Skippable segments, in order."),
    404: problem("No such season or episode.")
  }
});

const streamRoute = createRoute({
  method: "get",
  path: "/streams/{token}",
  tags: ["Playback"],
  summary: "Fetch a stream resource",
  description:
    "Serves a playlist, segment, file, or subtitle through the stream proxy. The token is the credential, so players can fetch it without headers. Playlists reference their children by relative token, so this path layout is part of the contract. `Range` is honoured for seeking.",
  request: {
    params: z.object({
      token: z.string().openapi({
        param: {
          name: "token",
          in: "path"
        }
      })
    })
  },
  responses: {
    200: {
      description: "The resource.",
      content: {
        "application/vnd.apple.mpegurl": {
          schema: z.string()
        },
        "application/octet-stream": {
          schema: z.string().openapi({
            format: "binary"
          })
        }
      }
    },
    206: {
      description: "Part of the resource, for a `Range` request."
    },
    403: problem("The token is forged, malformed, or expired."),
    502: problem("The upstream host failed.")
  }
});

/**
 * Stream resolution and delivery. Resolving streams requires a signed-in
 * user; fetching them only needs the token.
 */
export const playbackRoutes = createRouter()
  .openapi(playbackRoute, async (c) => {
    const { seasonId, episode } = c.req.valid("param");
    const playback = await resolvePlayback({
      seasonId,
      episode,
      language: c.req.valid("query").language
    });
    return c.json(playback, 200);
  })
  .openapi(skipTimesRoute, async (c) => {
    const { seasonId, episode } = c.req.valid("param");
    const items = await getSkipTimes(seasonId, episode, c.req.valid("query").duration);
    c.header("Cache-Control", publicCache(60 * 60));
    return c.json(
      {
        items
      },
      200
    );
  })
  .openapi(streamRoute, async (c) =>
    proxyStream(c.req.valid("param").token, {
      range: c.req.header("range") ?? null,
      signal: c.req.raw.signal
    })
  );
