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
	type Notification,
	type Notifications,
} from "./notifications/notifications";
export {
	getPlaybackPreferences,
	PlaybackPreferencesUpdateSchema,
	updatePlaybackPreferences,
	type PlaybackPreferences,
	type PlaybackPreferencesUpdate,
	type SubtitleChoice,
} from "./preferences/preferences";
export {
	dismissContinueWatching,
	getContinueWatching,
	getProgress,
	getSeriesProgress,
	markUnwatched,
	markWatched,
	ProgressInputSchema,
	removeProgress,
	saveProgress,
	startRewatch,
	type ContinueWatching,
	type EpisodeAddress,
	type NextEpisode,
	type Progress,
	type ProgressInput,
	type SeriesProgress,
} from "./progress/progress";
export type { WatchlistStatus } from "./watchlist/status";
export {
	getWatchlist,
	removeFromWatchlist,
	setWatchlistStatus,
	type WatchlistEntry,
} from "./watchlist/watchlist";
