/**
 * Episode lists, stream resolution, skip times, and the stream proxy.
 *
 * Streams come from third-party scrapers via `anime-sdk`. Providers are tried
 * in priority order, and clients only ever receive signed proxy tokens.
 *
 * @packageDocumentation
 */
export { listEpisodes, type Episode, type EpisodeList } from "./episodes/episodes";
export { proxyStream } from "./proxy/proxy";
export { StreamUpstreamError } from "./proxy/upstream";
export {
  PlaybackRequestSchema,
  resolvePlayback,
  type Playback,
  type PlaybackRequest,
  type PlaybackSource,
  type PlaybackSubtitle
} from "./streams/resolve";
export { getSkipTimes, type SkipSegment } from "./streams/skip-times";
