/**
 * The Sora SDK: a typed client for the Sora API.
 *
 * @packageDocumentation
 */
export { SoraError } from "./error";
export {
  SoraClient,
  type BrowseParams,
  type EpisodeRef,
  type RequestOptions,
  type Returned,
  type ScheduleParams,
  type SeasonRef,
  type SeriesOf,
  type SeriesParams,
  type SoraClientOptions
} from "./sora";
export type {
  CountMeta,
  Envelope,
  PageMeta,
  PlaybackMedia,
  PlaybackMeta,
  ScheduledEpisode,
  ScheduleMeta,
  Season,
  SeasonEpisode,
  SeasonEpisodesMeta,
  SeasonMeta,
  SeasonWithEpisodes,
  Series,
  SeriesCard,
  SeriesMeta,
  SeriesWithEpisodes,
  SkipSegment
} from "@sora/api";
