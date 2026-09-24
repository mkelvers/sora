/**
 * Stream resolution with skip segments, and the stream proxy. Episodes are addressed
 * by Sora season ID and episode number.
 *
 * Streams come from third-party scrapers via `anime-sdk`. Providers are tried
 * in priority order, and clients only ever receive signed proxy URLs.
 *
 * @packageDocumentation
 */
export { proxyStream } from "./proxy/proxy";
export { StreamUpstreamError } from "./proxy/upstream";
export {
  PlaybackRequestSchema,
  resolvePlayback,
  type Playback,
  type PlaybackMedia,
  type PlaybackOptions,
  type PlaybackRequest,
  type PlaybackSource,
  type PlaybackSubtitle
} from "./streams/resolve";
export type { SkipSegment } from "./providers/megaplay";
export type { EpisodeVersion } from "./episodes/versions";
