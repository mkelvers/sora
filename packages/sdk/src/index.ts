/**
 * The Sora SDK: a typed client for the Sora API.
 *
 * @packageDocumentation
 */
export { SoraError } from "./error";
export { Sora, type BrowseFilters, type RequestOptions, type SoraOptions } from "./sora";
export type { BrowseQuery, Page } from "@sora/core/catalog";
export type { Playback, PlaybackSource, PlaybackSubtitle, PlaybackVersion, SkipSegment } from "@sora/core/playback";
export type { ScheduledEpisode, Season, SeasonEpisode, Series, SeriesCard } from "@sora/core/series";
