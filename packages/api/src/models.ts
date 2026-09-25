/**
 * The API's models as clients receive them, in snake_case: what `results`
 * holds in each response, and the `meta` that comes with it.
 */
import type { z } from "@hono/zod-openapi";

import type { PageMetaSchema } from "./openapi/envelope";
import type {
  PlaybackMediaSchema,
  PlaybackMetaSchema,
  ScheduledEpisodeSchema,
  SeasonEpisodeSchema,
  SeasonSchema,
  SeriesCardSchema,
  SeriesSchema,
  SkipSegmentSchema
} from "./openapi/schemas";

export type SeriesCard = z.infer<typeof SeriesCardSchema>;
export type Series = z.infer<typeof SeriesSchema>;
export type Season = z.infer<typeof SeasonSchema>;
export type SeasonEpisode = z.infer<typeof SeasonEpisodeSchema>;
export type ScheduledEpisode = z.infer<typeof ScheduledEpisodeSchema>;
export type PlaybackMedia = z.infer<typeof PlaybackMediaSchema>;
export type PlaybackMeta = z.infer<typeof PlaybackMetaSchema>;
export type SkipSegment = z.infer<typeof SkipSegmentSchema>;
export type PageMeta = z.infer<typeof PageMetaSchema>;

/** The body of every successful JSON response. */
export interface Envelope<TResults, TMeta> {
  results: TResults;
  meta: TMeta;
}
