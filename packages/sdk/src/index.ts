/**
 * The Sora SDK: a typed client for the Sora API.
 *
 * @packageDocumentation
 */
export { SoraError } from "./error";
export {
  SoraClient,
  type ArtworkChanges,
  type BrowseParams,
  type ContinueWatchingParams,
  type EpisodeRef,
  type ImagesParams,
  type ProfileInput,
  type ProgressUpdate,
  type RequestOptions,
  type Returned,
  type ScheduleParams,
  type SeasonRef,
  type SeriesOf,
  type SeriesParams,
  type Session,
  type SignIn,
  type SoraClientOptions
} from "./sora";
export type {
  ContinueWatchingItem,
  CountMeta,
  EpisodeProgress,
  Envelope,
  PageMeta,
  PlaybackMedia,
  PlaybackMeta,
  Profile,
  ScheduledEpisode,
  ScheduleMeta,
  Season,
  SeasonEpisode,
  SeasonEpisodesMeta,
  SeasonMeta,
  SeasonWithEpisodes,
  Series,
  SeriesCard,
  SeriesImage,
  SeriesMeta,
  SeriesWithEpisodes,
  SkipSegment
} from "@sora/api";
