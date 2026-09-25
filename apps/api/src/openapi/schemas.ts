/**
 * The request parameters and response bodies of the `/v1` contracts, with
 * every field in snake_case. Every response schema is checked with
 * `satisfies` against the core's type in snake_case (see `SnakeCased`), so
 * the OpenAPI document cannot drift from what the handlers return.
 */
import { z } from "@hono/zod-openapi";
import type { AnimeTag } from "@sora/core/catalog";
import type { PlaybackMedia, SkipSegment } from "@sora/core/playback";
import type { ScheduledEpisode, Season, SeasonEpisode, Series, SeriesCard, SeriesImage } from "@sora/core/series";

import type { SnakeCased } from "./envelope";

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
    name: "anime_id",
    in: "path"
  },
  description: "Sora series ID.",
  example: "a_CZMtco3dTTAN"
});

export const SeasonIdParam = z.string().openapi({
  param: {
    name: "season_id",
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
    poster_url: z.string().nullable(),
    backdrop_url: z.string().nullable(),
    logo_url: z.string().nullable(),
    year: z.number().int().nullable().openapi({
      example: 2018
    }),
    status: StatusSchema.nullable()
  })
  .openapi("SeriesCard") satisfies z.ZodType<SnakeCased<SeriesCard>>;

const TagSchema = z.object({
  name: z.string(),
  rank: z.number().nullable(),
  spoiler: z.boolean()
}) satisfies z.ZodType<SnakeCased<AnimeTag>>;

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
    episode_count: z.number().int()
  })
  .openapi("Season") satisfies z.ZodType<SnakeCased<Season>>;

export const SeriesSchema = SeriesCardSchema.extend({
  overview: z.string().nullable(),
  genres: z.array(z.string()),
  tags: z.array(TagSchema),
  studios: z.array(z.string()),
  score: z.number().nullable().openapi({
    description: "AniList's weighted score of the first season, 0–100."
  }),
  next_episode: z
    .object({
      season_id: z.string(),
      number: z.number().int(),
      airing_at: z.string()
    })
    .nullable(),
  seasons: z.array(SeasonSchema),
  related: z.array(SeriesCardSchema)
}).openapi("Series") satisfies z.ZodType<SnakeCased<Series>>;

export const ImageTypeSchema = z.enum([
  "poster",
  "backdrop",
  "logo"
]);

export const SeriesImageSchema = z
  .object({
    type: ImageTypeSchema,
    url: z.string().openapi({
      description: "The original size. Swap `/original/` for a TMDB size bucket, such as `/w780/`, for a smaller file.",
      example: "https://image.tmdb.org/t/p/original/rBOnrVlck7BIlGeWVlzYiZeg4l2.jpg"
    }),
    width: z.number().int().openapi({
      example: 3840
    }),
    height: z.number().int().openapi({
      example: 2160
    }),
    language: z.string().nullable().openapi({
      description: "ISO 639-1 code of any text on the image; null when it has none.",
      example: "en"
    }),
    vote_average: z.number(),
    vote_count: z.number().int(),
    season_number: z.number().int().nullable().openapi({
      description: "TMDB's number of the season a poster is for; null for the title's own."
    })
  })
  .openapi("SeriesImage") satisfies z.ZodType<SnakeCased<SeriesImage>>;

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
    air_date: z.string().nullable().openapi({
      example: "2018-10-02"
    }),
    runtime_minutes: z.number().int().nullable(),
    still_url: z.string().nullable(),
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
  .openapi("SeasonEpisode") satisfies z.ZodType<SnakeCased<SeasonEpisode>>;

export const ScheduledEpisodeSchema = z
  .object({
    series: SeriesCardSchema,
    season_id: z.string(),
    episode: z.number().int(),
    airing_at: z.string()
  })
  .openapi("ScheduledEpisode") satisfies z.ZodType<SnakeCased<ScheduledEpisode>>;

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
  .openapi("SkipSegment") satisfies z.ZodType<SnakeCased<SkipSegment>>;

export const PlaybackMediaSchema = z
  .object({
    audio: LanguageSchema,
    locale: LocaleSchema.nullable().openapi({
      description: "Language of the dub's audio or of the sub's default subtitles: always `en`, since Sora serves English. Null for raw, which keeps the original audio and has no subtitles."
    }),
    provider: z.string().openapi({
      description: "The provider that serves this version."
    }),
    hardsub: z.boolean().openapi({
      description:
        "Whether the English subtitles are burned into the picture rather than served as a track, so they cannot be styled or turned off; `subtitles` then holds other languages only, if any. A sub with an English track is served when any provider has one. Always false for dub and raw."
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
        label: z.string().openapi({
          description: "The language's English name, for a subtitle menu.",
          example: "Brazilian Portuguese"
        }),
        format: z
          .enum([
            "vtt",
            "srt",
            "ass"
          ])
          .nullable()
      })
    ),
    skip_segments: z.array(SkipSegmentSchema).openapi({
      description:
        "Opening and ending, in playback order, as the provider's player ships them. Timed against these sources: a dub can be cut differently from its sub. Empty when the provider reports none."
    })
  })
  .openapi("PlaybackMedia") satisfies z.ZodType<SnakeCased<PlaybackMedia>>;

/** The episode a playback is for, when its stream URLs expire, and the episodes either side of it. */
export const PlaybackMetaSchema = z
  .object({
    anime_id: z.string(),
    season_id: z.string(),
    episode: z.number().int(),
    expires_at: z.string().openapi({
      description: "When the stream URLs stop working, as an ISO 8601 timestamp. Resolve again after it.",
      example: "2026-09-25T18:00:00.000Z"
    }),
    next: z.string().nullable().openapi({
      description:
        "The next episode's playback URL, into the next season of the same kind after a season's last episode, or null after the last one.",
      example: "/v1/anime/a_CZMtco3dTTAN/seasons/s_WGQtg1RoFmfJ/episodes/2/playback"
    }),
    previous: z.string().nullable().openapi({
      description: "The previous episode's playback URL, or null before the first one."
    })
  })
  .openapi("PlaybackMeta");
