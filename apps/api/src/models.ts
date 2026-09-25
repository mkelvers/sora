/**
 * The API's models as clients receive them, in snake_case: what `results`
 * holds in each response, and the `meta` that comes with it.
 */
import type { z } from "@hono/zod-openapi";

import type { CountMetaSchema, PageMetaSchema } from "./openapi/envelope";
import type { getSchedule, getSeason, getSeries, listSeasonEpisodes } from "./openapi/routes";
import type {
  PlaybackMediaSchema,
  PlaybackMetaSchema,
  ScheduledEpisodeSchema,
  SeasonEpisodeSchema,
  SeasonSchema,
  SeriesCardSchema,
  SeriesImageSchema,
  SeriesSchema,
  SkipSegmentSchema
} from "./openapi/schemas";

export type SeriesCard = z.infer<typeof SeriesCardSchema>;
export type Series = z.infer<typeof SeriesSchema>;
export type SeriesImage = z.infer<typeof SeriesImageSchema>;
export type Season = z.infer<typeof SeasonSchema>;
export type SeasonEpisode = z.infer<typeof SeasonEpisodeSchema>;
export type ScheduledEpisode = z.infer<typeof ScheduledEpisodeSchema>;
export type PlaybackMedia = z.infer<typeof PlaybackMediaSchema>;
export type PlaybackMeta = z.infer<typeof PlaybackMetaSchema>;
export type SkipSegment = z.infer<typeof SkipSegmentSchema>;
export type PageMeta = z.infer<typeof PageMetaSchema>;
export type CountMeta = z.infer<typeof CountMetaSchema>;

/** A season as `getSeries` returns it with `episodes=true`. */
export type SeasonWithEpisodes = Season & {
  episodes: SeasonEpisode[];
};

/** A title as `getSeries` returns it with `episodes=true`: every season carries its episodes. */
export type SeriesWithEpisodes = Omit<Series, "seasons"> & {
  seasons: SeasonWithEpisodes[];
};

/** The body a route answers with on success. */
type SuccessBody<
  TRoute extends {
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.ZodType;
          };
        };
      };
    };
  }
> = z.infer<TRoute["responses"][200]["content"]["application/json"]["schema"]>;

export type SeriesMeta = SuccessBody<typeof getSeries>["meta"];
export type SeasonMeta = SuccessBody<typeof getSeason>["meta"];
export type SeasonEpisodesMeta = SuccessBody<typeof listSeasonEpisodes>["meta"];
export type ScheduleMeta = SuccessBody<typeof getSchedule>["meta"];

/** The body of every successful JSON response. */
export interface Envelope<TResults, TMeta> {
  meta: TMeta;
  results: TResults;
}
