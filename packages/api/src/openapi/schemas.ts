/**
 * The request parameters and response bodies of the `/v1` contracts. Every
 * response schema is checked against the core's type with `satisfies`, so the
 * OpenAPI document cannot drift from what the handlers return.
 */
import { z } from "@hono/zod-openapi";
import type { AnimeTag, AnimeTrailer, Page } from "@sora/core/catalog";
import type { Playback, PlaybackMedia, SkipSegment } from "@sora/core/playback";
import type { ScheduledEpisode, Season, SeasonEpisode, Series, SeriesCard } from "@sora/core/series";

/**
 * An RFC 9457 problem details body, which every error response carries as
 * `application/problem+json`.
 */
export const ProblemSchema = z
  .object({
    type: z.string().openapi({
      example: "about:blank"
    }),
    title: z.string().openapi({
      example: "Not Found"
    }),
    status: z.number().int().openapi({
      example: 404
    }),
    detail: z.string().optional().openapi({
      example: "Series a_4kQ9vB2xLm0T does not exist"
    }),
    instance: z.string().optional().openapi({
      example: "/v1/anime/a_4kQ9vB2xLm0T"
    }),
    code: z.string().openapi({
      description:
        "A stable, machine-readable failure code to branch on; `detail` may change. New codes may be added, so clients must handle codes they do not know.",
      example: "SERIES_NOT_FOUND"
    }),
    /** Every invalid field, for `INVALID_INPUT` problems. */
    errors: z
      .array(
        z.object({
          path: z.string(),
          message: z.string()
        })
      )
      .optional()
  })
  .openapi("Problem");

/** The body of every error response. */
export type Problem = z.infer<typeof ProblemSchema>;

/** Wraps a list so it can grow fields, such as paging, without breaking clients. */
export function itemsOf<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    items: z.array(item)
  });
}

/** A problem response for the given status, for route definitions. */
export function problem(description: string) {
  return {
    description,
    content: {
      "application/problem+json": {
        schema: ProblemSchema
      }
    }
  };
}

/** A JSON response for the given schema, for route definitions. */
export function json<TSchema extends z.ZodType>(schema: TSchema, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema
      }
    }
  };
}

export const SeriesIdParam = z.string().openapi({
  param: {
    name: "animeId",
    in: "path"
  },
  description: "Sora series ID.",
  example: "a_CZMtco3dTTAN"
});

export const SeasonIdParam = z.string().openapi({
  param: {
    name: "seasonId",
    in: "path"
  },
  description: "Sora season ID.",
  example: "s_WGQtg1RoFmfJ"
});

export const EpisodeNumberParam = z.coerce
  .number()
  .int()
  .positive()
  .openapi({
    param: {
      name: "episode",
      in: "path"
    },
    description: "Position within the season, from 1.",
    example: 1
  });

const StatusSchema = z.enum([
  "FINISHED",
  "RELEASING",
  "NOT_YET_RELEASED",
  "CANCELLED",
  "HIATUS"
]);

export const SeriesCardSchema = z
  .object({
    id: z.string().openapi({
      example: "a_CZMtco3dTTAN"
    }),
    kind: z.enum([
      "tv",
      "movie",
      "standalone"
    ]),
    title: z.string().openapi({
      example: "That Time I Got Reincarnated as a Slime"
    }),
    posterUrl: z.string().nullable(),
    backdropUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
    year: z.number().int().nullable().openapi({
      example: 2018
    }),
    status: StatusSchema.nullable()
  })
  .openapi("SeriesCard") satisfies z.ZodType<SeriesCard>;

const TagSchema = z.object({
  name: z.string(),
  rank: z.number().nullable(),
  spoiler: z.boolean()
}) satisfies z.ZodType<AnimeTag>;

const TrailerSchema = z.object({
  site: z.enum([
    "youtube",
    "dailymotion"
  ]),
  id: z.string()
}) satisfies z.ZodType<AnimeTrailer>;

export const SeasonSchema = z
  .object({
    id: z.string().openapi({
      example: "s_WGQtg1RoFmfJ"
    }),
    kind: z.enum([
      "season",
      "ova",
      "movie"
    ]),
    number: z.number().int(),
    title: z.string().openapi({
      example: "Season 1"
    }),
    episodeCount: z.number().int()
  })
  .openapi("Season") satisfies z.ZodType<Season>;

export const SeriesSchema = SeriesCardSchema.extend({
  overview: z.string().nullable(),
  genres: z.array(z.string()),
  tags: z.array(TagSchema),
  studios: z.array(z.string()),
  score: z.number().nullable().openapi({
    description: "AniList's weighted score of the first season, 0–100."
  }),
  trailer: TrailerSchema.nullable(),
  nextEpisode: z
    .object({
      seasonId: z.string(),
      number: z.number().int(),
      airingAt: z.string()
    })
    .nullable(),
  seasons: z.array(SeasonSchema),
  related: z.array(SeriesCardSchema)
}).openapi("Series") satisfies z.ZodType<Series>;

/** Dubbed audio, the original audio with subtitles (sub), or the original audio alone (raw). */
export const LanguageSchema = z.enum([
  "dub",
  "sub",
  "raw"
]);

export const SeasonEpisodeSchema = z
  .object({
    number: z.number().int(),
    title: z.string().nullable(),
    overview: z.string().nullable(),
    airDate: z.string().nullable().openapi({
      example: "2018-10-02"
    }),
    runtimeMinutes: z.number().int().nullable(),
    stillUrl: z.string().nullable(),
    audio: z
      .array(LanguageSchema)
      .nullable()
      .openapi({
        description:
          "The audio the episode can be watched with, dub before sub before raw: dubbed, the original with subtitles, or the original alone. Empty when nothing streams it, and null only when Sora could not look it up on providers yet: list the season again shortly."
      }),
    filler: z.boolean().openapi({
      description: "Whether the episode is filler: story the manga does not have. False when no provider says it is."
    }),
    extra: z.boolean().openapi({
      description: "An extra only TMDB lists, such as a recap special. It cannot be played."
    })
  })
  .openapi("SeasonEpisode") satisfies z.ZodType<SeasonEpisode>;

export const ScheduledEpisodeSchema = z
  .object({
    series: SeriesCardSchema,
    seasonId: z.string(),
    episode: z.number().int(),
    airingAt: z.string()
  })
  .openapi("ScheduledEpisode") satisfies z.ZodType<ScheduledEpisode>;

export const SeriesPageSchema = z
  .object({
    items: z.array(SeriesCardSchema),
    page: z.number().int(),
    hasNextPage: z.boolean()
  })
  .openapi("SeriesPage") satisfies z.ZodType<Page<SeriesCard>>;

export const LocaleSchema = z.string().min(1).openapi({
  description: "BCP 47 language tag.",
  example: "en"
});

export const SkipSegmentSchema = z
  .object({
    kind: z.enum([
      "opening",
      "ending"
    ]),
    start: z.number().nonnegative().openapi({
      description: "Seconds from the start of the stream."
    }),
    end: z.number().positive().openapi({
      description: "Seconds from the start of the stream; always after `start`."
    })
  })
  .openapi("SkipSegment") satisfies z.ZodType<SkipSegment>;

export const PlaybackMediaSchema = z
  .object({
    audio: LanguageSchema,
    locale: LocaleSchema.nullable().openapi({
      description: "Language of the dub's audio or of the sub's subtitles: always `en`, since Sora serves English only. Null for raw, which keeps the original audio and has no subtitles."
    }),
    provider: z.string().openapi({
      description: "The provider that serves this version."
    }),
    hardsub: z.boolean().openapi({
      description:
        "Whether the subtitles are burned into the picture rather than served as tracks, so `subtitles` is empty and they cannot be styled or turned off. A sub with subtitle tracks is served when any provider has one. Always false for dub and raw."
    }),
    sources: z
      .array(
        z.object({
          url: z.url().openapi({
            description: "The stream through Sora's proxy; hand it to the player as is. Expires with the playback."
          }),
          format: z.enum([
            "hls",
            "mp4"
          ]),
          quality: z.enum([
            "auto",
            "1080p",
            "720p",
            "480p",
            "360p"
          ])
        })
      )
      .openapi({
        description: "Ordered best first."
      }),
    subtitles: z.array(
      z.object({
        url: z.url().openapi({
          description: "The subtitle file through Sora's proxy; hand it to the player as is. Expires with the playback."
        }),
        language: z.string().openapi({
          description: "BCP 47 language tag.",
          example: "en"
        }),
        label: z.string(),
        format: z
          .enum([
            "vtt",
            "srt",
            "ass"
          ])
          .nullable()
      })
    ),
    skipSegments: z.array(SkipSegmentSchema).openapi({
      description:
        "Opening and ending, in playback order, as AniKoto's player ships them. Timed against these sources: a dub can be cut differently from its sub. Empty when the provider reports none."
    })
  })
  .openapi("PlaybackMedia") satisfies z.ZodType<PlaybackMedia>;

export const PlaybackSchema = z
  .object({
    animeId: z.string(),
    seasonId: z.string(),
    episode: z.number().int(),
    media: z.array(PlaybackMediaSchema).openapi({
      description:
        "Every English version a provider can stream right now: dub before sub before raw, so the first is the one to play by default. A version no provider can stream right now is left out, and subtitles are English only. A sub always has subtitles: as tracks, or burned into the picture when `hardsub` is true. Dub and raw have none."
    })
  })
  .openapi("Playback") satisfies z.ZodType<Playback>;
