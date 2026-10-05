/**
 * Stream resolution with skip segments, and the stream proxy. Episodes are addressed
 * by Sora season ID and episode number.
 *
 * Streams come from third-party scrapers via `anime-sdk`. Providers are tried
 * in priority order, and clients only ever receive signed proxy URLs.
 *
 * @packageDocumentation
 */
export { isWebClientKey } from "./proxy/client-key";
export { proxyStream } from "./proxy/proxy";
export { StreamUpstreamError } from "./proxy/upstream";
export {
	PlaybackRequestSchema,
	resolvePlayback,
	type Playback,
	type PlaybackOptions,
	type PlaybackRequest,
} from "./streams/resolve";
export type { EpisodeVersion } from "./episodes/versions";
export {
	failingAfterCalls,
	failingAfterMs,
	getProviderHealth,
	type OperationSummary,
	type ProviderHealth,
	type ProviderStatus,
} from "./providers/health";
export type { ProviderOperation } from "./providers/calls";
