import { z } from "@hono/zod-openapi";
import type { AnimeTag, AnimeTrailer } from "@sora/core/catalog";
import type { ScheduledEpisode, Season, SeasonEpisode, Series, SeriesCard } from "@sora/core/series";

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
  .openapi("AnimeCard") satisfies z.ZodType<SeriesCard>;

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
}).openapi("Anime") satisfies z.ZodType<Series>;

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
    isExtra: z.boolean().openapi({
      description: "An extra only TMDB lists, such as a recap special. It cannot be played."
    })
  })
  .openapi("Episode") satisfies z.ZodType<SeasonEpisode>;

export const ScheduledEpisodeSchema = z
  .object({
    anime: SeriesCardSchema,
    seasonId: z.string(),
    episode: z.number().int(),
    airingAt: z.string()
  })
  .openapi("ScheduledEpisode");

/** The schedule item as the API sends it: the title is called `anime` in every response. */
export function toScheduledEpisodeBody({ series, ...rest }: ScheduledEpisode): z.infer<typeof ScheduledEpisodeSchema> {
  return {
    anime: series,
    ...rest
  };
}

export const PageSchema = z
  .object({
    items: z.array(SeriesCardSchema),
    page: z.number().int(),
    hasNextPage: z.boolean()
  })
  .openapi("AnimePage");
