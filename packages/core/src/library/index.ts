/**
 * What Sora keeps per profile: the titles featured on its home page, its
 * playback preferences, its watchlist, the notifications it gets, and its progress through the
 * episodes it played.
 *
 * Every function takes an opaque `userId` from the caller's identity layer.
 * The core trusts it, so callers must authenticate before calling.
 *
 * @packageDocumentation
 */
export { getFeatured } from "./featured/featured";
export {
	dismissNotification,
	getNotifications,
	markNotificationsRead,
	type Notifications,
} from "./notifications/notifications";
export { getPlaybackPreferences, updatePlaybackPreferences } from "./preferences/preferences";
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
export { getWatchlist, removeFromWatchlist, setWatchlistStatus } from "./watchlist/watchlist";
