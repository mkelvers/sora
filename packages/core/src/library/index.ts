/**
 * What Sora keeps per profile: the titles featured on its home page, its
 * playback preferences, its watchlist, the notifications it gets, and its progress through the
 * episodes it played.
 *
 * Every function takes an opaque `userId` from the caller's identity layer.
 * The core trusts it, so callers must authenticate before calling.
 */
export { featured } from "./featured/featured";

export { type Notifications, notifications } from "./notifications/notifications";

export { authorizationUrl, importOptions } from "./transfer/oauth";

export {
	disconnectImport,
	exportLibrary,
	importLibrary,
	listImportConnections,
	undoImport,
} from "./transfer/transfer";

export { preferences } from "./preferences/preferences";

export {
	dismissContinueWatching,
	getContinueWatching,
	getProgress,
	getSeriesProgress,
	markUnwatched,
	markWatched,
	removeProgress,
	saveProgress,
	startRewatch,
	type EpisodeAddress,
} from "./progress/progress";

export { ratings } from "./ratings/ratings";

export { recommendations } from "./recommendations/recommendations";

export { watchlist } from "./watchlist/watchlist";

export { getNowWatching } from "./progress/now-watching";
