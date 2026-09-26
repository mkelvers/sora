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

import { CountMetaSchema, envelopeOf, PageMetaSchema } from "./envelope";
import {
  ContinueWatchingItemSchema,
  EpisodeNumberParam,
  EpisodeProgressSchema,
  ImageTypeSchema,
  json,
  PlaybackMediaSchema,
  PlaybackMetaSchema,
  problem,
  ProfileIdParam,
  ProfileInputSchema,
  ProfileSchema,
  ProgressUpdateSchema,
  ScheduledEpisodeSchema,
  SeasonSchema,
  SeasonEpisodeSchema,
  SeasonIdParam,
  SeriesCardSchema,
  SeriesIdParam,
  SeriesImageSchema,
  SeriesSchema
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
 * The core's browse filters as query parameters in snake_case, without the
 * free-text search, which is its own route. Query strings carry every value
 * as text, so numbers and lists are parsed before the core's own rules
 * apply; the core supplies defaults. Unknown parameters are rejected: a
 * misspelled one would otherwise return the unfiltered catalog.
 */
const BrowseParams = BrowseQuerySchema.omit({
  search: true,
  seasonYear: true,
  perPage: true
})
  .strict()
  .extend({
    season_year: z.coerce.number().pipe(browse.seasonYear.unwrap()).optional(),
    format: commaSeparated(browse.format.unwrap(), "TV,MOVIE"),
    genres: commaSeparated(browse.genres.unwrap(), "Action,Fantasy"),
    page: z.coerce.number().pipe(browse.page.unwrap()).optional(),
    per_page: z.coerce.number().pipe(browse.perPage.unwrap()).optional()
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
  series_id: SeriesIdParam,
  season_id: SeasonIdParam
});

/** A page of title cards. */
const SeriesPageSchema = envelopeOf(z.array(SeriesCardSchema), PageMetaSchema);

/** Nothing to say about the response beyond its results. */
const EmptyMetaSchema = z.object({}).openapi("EmptyMeta");

/** An episode, addressed under its season. */
const EpisodeParams = SeasonParams.extend({
  episode: EpisodeNumberParam
});

export const browseSeries = createRoute({
  operationId: "browseSeries",
  method: "get",
  path: "/series",
  tags: ["Series"],
  summary: "Browse series",
  description:
    "Filters and sorts the catalog; `searchSeries` searches it by text. One card per title: a show appears once, not once per season. A page can hold fewer cards than `per_page` when several AniList entries belong to one title, and titles not prepared yet may be missing while they are prepared in the background.",
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
  tags: ["Series"],
  summary: "Search series",
  description:
    "Finds titles matching `q` in English, romaji, Japanese, or a known synonym or abbreviation, forgiving typos. Best match first, weighing how popular titles are, unless `sort` is given; narrowed by the same filters as `browseSeries`. One card per title, and a first search for a title not prepared yet may come back without it while it is prepared in the background.",
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
  path: "/series/{series_id}",
  tags: ["Series"],
  summary: "Get a series",
  description: "The title's page: details, artwork, seasons, the next episode, and related titles.",
  request: {
    params: z.object({
      series_id: SeriesIdParam
    }),
    query: z
      .object({
        episodes: z
          .enum([
            "true",
            "false"
          ])
          .transform((value) => value === "true")
          .optional()
          .openapi({
            type: "boolean",
            description:
              "Whether each season carries its episodes, as `listSeasonEpisodes` lists them, so a title's page needs one request.",
            example: true
          })
      })
      .strict()
  },
  responses: {
    200: json(
      envelopeOf(
        SeriesSchema.extend({
          seasons: z.array(
            SeasonSchema.extend({
              episodes: z.array(SeasonEpisodeSchema).optional().openapi({
                description: "The season's episodes, numbered from 1; present only with `episodes=true`."
              })
            })
          )
        }),
        EmptyMetaSchema
      ),
      "The title."
    ),
    404: problem("No such title."),
    422: problem("The query is invalid.")
  }
});

export const listImages = createRoute({
  operationId: "listImages",
  method: "get",
  path: "/series/{series_id}/images",
  tags: ["Series"],
  summary: "List a series' images",
  description:
    "Every backdrop, poster, and logo TMDB has for the title, in every language, and for a show each season's posters too. Choose one with `updateArtwork`. Titles TMDB does not list have none.",
  request: {
    params: z.object({
      series_id: SeriesIdParam
    }),
    query: z
      .object({
        type: commaSeparated(z.array(ImageTypeSchema), "backdrop,poster").openapi({
          description: "Only these types; every type when omitted."
        }),
        language: commaSeparated(
          z.array(z.string().regex(/^(?:[a-z]{2}|none)$/)).transform((codes) => codes.map((code) => (code === "none" ? null : code))),
          "en,none"
        ).openapi({
          description: "Only these ISO 639-1 languages, `none` meaning textless; every language when omitted."
        }),
        sort: z
          .enum([
            "votes",
            "quality"
          ])
          .optional()
          .openapi({
            description:
              "`votes`: TMDB users' rating, weighted by how many voted, then size (the default). `quality`: the largest original first, then votes."
          })
      })
      .strict()
  },
  responses: {
    200: json(envelopeOf(z.array(SeriesImageSchema), CountMetaSchema), "The images, best first."),
    404: problem("No such title."),
    422: problem("The query is invalid."),
    503: problem("TMDB is unavailable; retry after `Retry-After`.")
  }
});

/** An image to use for a title's artwork, or `null` to go back to the one Sora chose. */
const ArtworkUrl = z
  .url({
    protocol: /^https$/
  })
  .max(2_048)
  .nullable()
  .optional();

export const updateArtwork = createRoute({
  operationId: "updateArtwork",
  method: "patch",
  path: "/series/{series_id}/artwork",
  tags: ["Series"],
  summary: "Change a series' artwork",
  description:
    "Chooses the title's poster, backdrop, or logo for everyone. An HTTPS URL replaces the image, `null` goes back to the one Sora chose, and an omitted field stays as it is. The choice is kept when the title is laid out again.",
  request: {
    params: z.object({
      series_id: SeriesIdParam
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z
            .object({
              poster_url: ArtworkUrl,
              backdrop_url: ArtworkUrl,
              logo_url: ArtworkUrl
            })
            .strict()
            .openapi("ArtworkChanges", {
              example: {
                backdrop_url: "https://image.tmdb.org/t/p/original/rBOnrVlck7BIlGeWVlzYiZeg4l2.jpg"
              }
            })
        }
      }
    }
  },
  responses: {
    200: json(envelopeOf(SeriesSchema, EmptyMetaSchema), "The title, with its new artwork."),
    404: problem("No such title."),
    422: problem("The body is invalid.")
  }
});

export const getSeason = createRoute({
  operationId: "getSeason",
  method: "get",
  path: "/series/{series_id}/seasons/{season_id}",
  tags: ["Series"],
  summary: "Get a season",
  request: {
    params: SeasonParams
  },
  responses: {
    200: json(
      envelopeOf(
        SeasonSchema,
        z.object({
          series_id: z.string()
        })
      ),
      "The season."
    ),
    404: problem("No such season in this title.")
  }
});

export const listSeasonEpisodes = createRoute({
  operationId: "listSeasonEpisodes",
  method: "get",
  path: "/series/{series_id}/seasons/{season_id}/episodes",
  tags: ["Series"],
  summary: "List a season's episodes",
  request: {
    params: SeasonParams
  },
  responses: {
    200: json(
      envelopeOf(
        z.array(SeasonEpisodeSchema),
        CountMetaSchema.extend({
          series_id: z.string(),
          season_id: z.string()
        })
      ),
      "The season's episodes, numbered from 1."
    ),
    404: problem("No such season in this title.")
  }
});

export const listGenres = createRoute({
  operationId: "listGenres",
  method: "get",
  path: "/genres",
  tags: ["Series"],
  summary: "List genres",
  responses: {
    200: json(envelopeOf(z.array(z.string()), CountMetaSchema), "Genre names accepted by `browseSeries`.")
  }
});

export const getSchedule = createRoute({
  operationId: "getSchedule",
  method: "get",
  path: "/schedule",
  tags: ["Series"],
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
    200: json(
      envelopeOf(
        z.array(ScheduledEpisodeSchema),
        CountMetaSchema.extend({
          from: z.string(),
          until: z.string()
        })
      ),
      "Scheduled episodes, and the window they air in."
    ),
    422: problem("The window is invalid or longer than 14 days.")
  }
});

export const getPlayback = createRoute({
  operationId: "getPlayback",
  method: "get",
  path: "/series/{series_id}/seasons/{season_id}/episodes/{episode}/playback",
  tags: ["Playback"],
  summary: "Get everything needed to play an episode",
  description:
    "Resolves streams for every version of the episode at once, such as sub and dub, each from the first provider that can play it, with its skip segments. Sources and subtitles are URLs a player fetches directly; they expire, so resolve again rather than storing them.",
  request: {
    params: EpisodeParams
  },
  responses: {
    200: json(
      envelopeOf(
        z.array(PlaybackMediaSchema).openapi({
          description:
            "Every English version a provider can stream right now: dub before sub before raw, so the first is the one to play by default. A version no provider can stream right now is left out. A sub carries every subtitle language its provider has, English first, and always has English: as a track, or burned into the picture when `hardsub` is true. A dub carries the sub's WebVTT tracks retimed to its own encode, when the two encodes can be aligned. Raw has none."
        }),
        PlaybackMetaSchema
      ),
      "Streams and skip segments for every version of the episode."
    ),
    404: problem("No such season or episode in this title, or nothing streams it."),
    502: problem("Providers list the episode but none can stream it right now.")
  }
});

export const getEpisodePlayback = createRoute({
  operationId: "getEpisodePlayback",
  method: "get",
  path: "/seasons/{season_id}/episodes/{episode}/playback",
  tags: ["Playback"],
  summary: "Get everything needed to play an episode, by its season",
  description:
    "`getPlayback` addressed by the season alone, since a season ID identifies its title. `meta.next` and `meta.previous` are in this form too.",
  request: {
    params: z.object({
      season_id: SeasonIdParam,
      episode: EpisodeNumberParam
    })
  },
  responses: getPlayback.responses
});

export const getStream = createRoute({
  operationId: "getStream",
  method: "get",
  path: "/streams/{token}",
  tags: ["Playback"],
  summary: "Fetch a stream resource",
  description:
    "Serves a playlist, segment, file, or subtitle through the stream proxy. `getPlayback` hands out these URLs; players fetch them directly: the token is the credential, and any origin may fetch it. Playlists reference their children by relative token, so the token must stay the last path segment. `Range` is honoured for seeking.",
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

/** Routes that need a signed-in account, as a bearer token or session cookie. */
const signedIn = [
  {
    session: []
  }
];

const ProfileParams = z.object({
  profile_id: ProfileIdParam
});

export const listProfiles = createRoute({
  operationId: "listProfiles",
  method: "get",
  path: "/profiles",
  tags: ["Profiles"],
  summary: "List the account's profiles",
  description: "Every profile of the signed-in account, oldest first. A new account starts with one.",
  security: signedIn,
  responses: {
    200: json(envelopeOf(z.array(ProfileSchema), CountMetaSchema), "The profiles."),
    401: problem("Not signed in.")
  }
});

export const createProfile = createRoute({
  operationId: "createProfile",
  method: "post",
  path: "/profiles",
  tags: ["Profiles"],
  summary: "Add a profile",
  description: "An account may hold any number of profiles.",
  security: signedIn,
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: ProfileInputSchema
        }
      }
    }
  },
  responses: {
    201: json(envelopeOf(ProfileSchema, EmptyMetaSchema), "The new profile."),
    401: problem("Not signed in."),
    422: problem("The body is invalid.")
  }
});

export const updateProfile = createRoute({
  operationId: "updateProfile",
  method: "patch",
  path: "/profiles/{profile_id}",
  tags: ["Profiles"],
  summary: "Rename or recolor a profile",
  security: signedIn,
  request: {
    params: ProfileParams,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: ProfileInputSchema.partial()
        }
      }
    }
  },
  responses: {
    200: json(envelopeOf(ProfileSchema, EmptyMetaSchema), "The profile."),
    401: problem("Not signed in."),
    404: problem("The account has no such profile."),
    422: problem("The body is invalid.")
  }
});

export const deleteProfile = createRoute({
  operationId: "deleteProfile",
  method: "delete",
  path: "/profiles/{profile_id}",
  tags: ["Profiles"],
  summary: "Delete a profile",
  description: "Deletes the profile with its progress and watchlist.",
  security: signedIn,
  request: {
    params: ProfileParams
  },
  responses: {
    204: {
      description: "Deleted."
    },
    401: problem("Not signed in."),
    404: problem("The account has no such profile."),
    409: problem("The profile is the account's last; an account keeps at least one.")
  }
});

export const getContinueWatching = createRoute({
  operationId: "getContinueWatching",
  method: "get",
  path: "/profiles/{profile_id}/continue-watching",
  tags: ["Profiles"],
  summary: "Titles to pick back up",
  description:
    "One entry per recently played title, most recent first, with the episode and position to resume: an unfinished episode where it stopped, or the next episode from the start. Finished and dropped titles are left out.",
  security: signedIn,
  request: {
    params: ProfileParams,
    query: z.object({
      series_id: SeriesIdParam.optional().openapi({
        param: {
          name: "series_id",
          in: "query"
        },
        description: "Only this title, for a title's page: at most one entry, none when there is nothing to resume."
      })
    })
  },
  responses: {
    200: json(envelopeOf(z.array(ContinueWatchingItemSchema), CountMetaSchema), "The titles."),
    401: problem("Not signed in."),
    404: problem("The account has no such profile.")
  }
});

export const getRecommendations = createRoute({
  operationId: "getRecommendations",
  method: "get",
  path: "/profiles/{profile_id}/recommendations",
  tags: ["Profiles"],
  summary: "Titles the profile may like",
  description:
    "Titles the profile has not played or listed, best fit first, from AniList users' recommendations for what it has played and listed and the genres those share, weighed by how well liked each title is. Finished and much-watched titles count most, recent ones more than old ones, and dropped titles count against what they are like. Empty for a profile with no history.",
  security: signedIn,
  request: {
    params: ProfileParams
  },
  responses: {
    200: json(envelopeOf(z.array(SeriesCardSchema), CountMetaSchema), "The titles."),
    401: problem("Not signed in."),
    404: problem("The account has no such profile.")
  }
});

export const getSeriesProgress = createRoute({
  operationId: "getSeriesProgress",
  method: "get",
  path: "/profiles/{profile_id}/progress/{series_id}",
  tags: ["Profiles"],
  summary: "A title's saved progress",
  description: "The saved position of every episode of the title the profile has played, in title order.",
  security: signedIn,
  request: {
    params: ProfileParams.extend({
      series_id: SeriesIdParam
    })
  },
  responses: {
    200: json(envelopeOf(z.array(EpisodeProgressSchema), CountMetaSchema), "The checkpoints."),
    401: problem("Not signed in."),
    404: problem("The account has no such profile, or no such title.")
  }
});

export const recordProgress = createRoute({
  operationId: "recordProgress",
  method: "put",
  path: "/profiles/{profile_id}/progress",
  tags: ["Profiles"],
  summary: "Save a playback position",
  description:
    "Players report their position every few seconds while playing, and on pause and exit. An older `event_at` than the one saved changes nothing. Playing a title puts it on the watchlist as watching; finishing the last episode of a finished title marks it completed.",
  security: signedIn,
  request: {
    params: ProfileParams,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: ProgressUpdateSchema
        }
      }
    }
  },
  responses: {
    204: {
      description: "Saved."
    },
    401: problem("Not signed in."),
    404: problem("The account has no such profile, season, or episode."),
    422: problem("The body is invalid.")
  }
});
