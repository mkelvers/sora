/**
 * The Sora SDK: a typed client for the Sora API.
 *
 * @packageDocumentation
 */
export { SoraError } from "./error";
export { Sora, type BrowseFilters, type RequestOptions, type SoraOptions } from "./sora";
export type {
  Envelope,
  PageMeta,
  PlaybackMedia,
  PlaybackMeta,
  ScheduledEpisode,
  Season,
  SeasonEpisode,
  Series,
  SeriesCard,
  SkipSegment
} from "@sora/api";
