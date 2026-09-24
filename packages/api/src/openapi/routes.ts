/**
 * The contract of every `/v1` route: path, parameters, and documented
 * responses. The server validates requests against these and the OpenAPI
 * document is generated from them, so the two cannot disagree. Handlers live
 * in `v1.ts`.
 *
 * `operationId`s name the methods of clients generated for other languages
 * (Kotlin, Swift). They are part of the public contract: never rename one
 * within `/v1`.
 */
import { createRoute, z } from "@hono/zod-openapi";
import { BrowseQuerySchema } from "@sora/core/catalog";

import {
  EpisodeNumberParam,
  itemsOf,
  json,
  PlaybackSchema,
  problem,
  ScheduledEpisodeSchema,
  SeasonSchema,
  SeasonEpisodeSchema,
  SeasonIdParam,
  SeriesIdParam,
  SeriesPageSchema,
  SeriesSchema,
  SkipSegmentSchema
} from "./schemas";

const { shape: browse } = BrowseQuerySchema;

/** A comma-separated query value, such as `genres=Action,Comedy`, as a list. */
function commaSeparated<TList extends z.ZodType<unknown, string[]>>(list: TList, example: string) {
  return z
    .string()
    .transform((value) =>
      value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    )
    .pipe(list)
    .optional()
    .openapi({
      type: "string",
      example
    });
}

/**
 * The core's browse filters as query parameters, without the free-text
 * search, which is its own route. Query strings carry every value as text,
 * so numbers and lists are parsed before the core's own rules apply; the
 * core supplies defaults. Unknown parameters are rejected: a misspelled one
 * would otherwise return the unfiltered catalog.
 */
const BrowseParams = BrowseQuerySchema.omit({
  search: true
})
  .strict()
  .extend({
    seasonYear: z.coerce.number().pipe(browse.seasonYear.unwrap()).optional(),
    format: commaSeparated(browse.format.unwrap(), "TV,MOVIE"),
    genres: commaSeparated(browse.genres.unwrap(), "Action,Fantasy"),
    page: z.coerce.number().pipe(browse.page.unwrap()).optional(),
    perPage: z.coerce.number().pipe(browse.perPage.unwrap()).optional()
  });

/** {@link BrowseParams} with the search text, which is required. */
const SearchParams = BrowseParams.extend({
  q: browse.search.unwrap().openapi({
    description: "The text to search titles for.",
    example: "k-on"
  })
});

/** A season, addressed under the series it belongs to. */
const SeasonParams = z.object({
  animeId: SeriesIdParam,
  seasonId: SeasonIdParam
});

/** An episode, addressed under its season. */
const EpisodeParams = SeasonParams.extend({
  episode: EpisodeNumberParam
});

export const browseSeries = createRoute({
  operationId: "browseSeries",
  method: "get",
  path: "/anime",
  tags: ["Anime"],
  summary: "Browse anime",
  description:
    "Filters and sorts the catalog; `searchSeries` searches it by text. One card per title: a show appears once, not once per season. A page can hold fewer cards than `perPage` when several AniList entries belong to one title, and titles not prepared yet may be missing while they are prepared in the background.",
  request: {
    query: BrowseParams
  },
  responses: {
    200: json(SeriesPageSchema, "A page of titles."),
    422: problem("The query is invalid."),
    503: problem("The catalog upstream is unavailable; retry after `Retry-After`.")
  }
});

export const searchSeries = createRoute({
  operationId: "searchSeries",
  method: "get",
  path: "/search",
  tags: ["Anime"],
  summary: "Search anime",
  description:
    "Finds titles matching `q`, best match first unless `sort` is given, narrowed by the same filters as `browseSeries`. One card per title, and a first search for an unknown franchise may come back short while the rest is prepared in the background.",
  request: {
    query: SearchParams
  },
  responses: {
    200: json(SeriesPageSchema, "A page of titles."),
    422: problem("The query is invalid or `q` is missing."),
    503: problem("The catalog upstream is unavailable; retry after `Retry-After`.")
  }
});

export const getSeries = createRoute({
  operationId: "getSeries",
  method: "get",
  path: "/anime/{animeId}",
  tags: ["Anime"],
  summary: "Get an anime",
  description: "The title's page: details, artwork, seasons, the next episode, and related titles.",
  request: {
    params: z.object({
      animeId: SeriesIdParam
    })
  },
  responses: {
    200: json(SeriesSchema, "The title."),
    404: problem("No such title.")
  }
});

export const getSeason = createRoute({
  operationId: "getSeason",
  method: "get",
  path: "/anime/{animeId}/seasons/{seasonId}",
  tags: ["Anime"],
  summary: "Get a season",
  request: {
    params: SeasonParams
  },
  responses: {
    200: json(SeasonSchema, "The season."),
    404: problem("No such season in this title.")
  }
});

export const listSeasonEpisodes = createRoute({
  operationId: "listSeasonEpisodes",
  method: "get",
  path: "/anime/{animeId}/seasons/{seasonId}/episodes",
  tags: ["Anime"],
  summary: "List a season's episodes",
  request: {
    params: SeasonParams
  },
  responses: {
    200: json(itemsOf(SeasonEpisodeSchema), "The season's episodes, numbered from 1."),
    404: problem("No such season in this title.")
  }
});

export const listGenres = createRoute({
  operationId: "listGenres",
  method: "get",
  path: "/genres",
  tags: ["Anime"],
  summary: "List genres",
  responses: {
    200: json(itemsOf(z.string()), "Genre names accepted by `browseSeries`.")
  }
});

export const getSchedule = createRoute({
  operationId: "getSchedule",
  method: "get",
  path: "/schedule",
  tags: ["Anime"],
  summary: "Release schedule",
  description: "Episodes airing in a window of up to 14 days, in broadcast order. Defaults to the next 7 days.",
  request: {
    query: z.object({
      from: z.iso
        .datetime({
          offset: true
        })
        .optional(),
      until: z.iso
        .datetime({
          offset: true
        })
        .optional()
    })
  },
  responses: {
    200: json(itemsOf(ScheduledEpisodeSchema), "Scheduled episodes."),
    422: problem("The window is invalid or longer than 14 days.")
  }
});

export const getPlayback = createRoute({
  operationId: "getPlayback",
  method: "get",
  path: "/anime/{animeId}/seasons/{seasonId}/episodes/{episode}/playback",
  tags: ["Playback"],
  summary: "Get streams for an episode",
  description:
    "Resolves streams for every version of the episode at once, such as sub and dub, each from the first provider that can play it. Sources and subtitles are stream tokens for `getStream`; they expire, so resolve again rather than storing them.",
  request: {
    params: EpisodeParams
  },
  responses: {
    200: json(PlaybackSchema, "Streams for every version of the episode."),
    404: problem("No such season or episode in this title, or nothing streams it."),
    502: problem("Providers list the episode but none can stream it right now.")
  }
});

export const getSkipTimes = createRoute({
  operationId: "getSkipTimes",
  method: "get",
  path: "/anime/{animeId}/seasons/{seasonId}/episodes/{episode}/skip-times",
  tags: ["Playback"],
  summary: "Get opening, ending, and recap times",
  description: "From AniKoto, falling back to crowd-sourced AniSkip times when AniKoto has none. An empty list means nothing is known.",
  request: {
    params: EpisodeParams,
    query: z.object({
      duration: z.coerce.number().positive().optional().openapi({
        description: "The playing stream's duration in seconds; narrows results to encodes of similar length."
      })
    })
  },
  responses: {
    200: json(itemsOf(SkipSegmentSchema), "Skippable segments, in order."),
    404: problem("No such season or episode in this title.")
  }
});

export const getStream = createRoute({
  operationId: "getStream",
  method: "get",
  path: "/streams/{token}",
  tags: ["Playback"],
  summary: "Fetch a stream resource",
  description:
    "Serves a playlist, segment, file, or subtitle through the stream proxy. Players fetch it directly: the token is the credential, and any origin may fetch it. Playlists reference their children by relative token, so the token must stay the last path segment. `Range` is honoured for seeking.",
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
