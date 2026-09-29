/**
 * Per-user library: library statuses, episode progress, playback history,
 * continue watching, and recommendations.
 *
 * Every function takes an opaque `userId` from the caller's identity layer.
 * The core trusts it, so callers must authenticate before calling. Titles
 * and episodes are addressed by Sora series and season IDs.
 *
 * Four things are kept apart:
 *
 * - A series' library status follows what the user does: adding it,
 *   starting it, and watching everything that has come out.
 * - Episode progress is whether each episode is watched, and where playback
 *   of it stands. Season progress, whether the user is caught up, and what
 *   to watch next are derived from it, never stored.
 * - History is when episodes were actually played. Marking an episode
 *   watched is not playback and does not appear there.
 * - Continue watching is derived from episode progress alone.
 *
 * Notifications, what came out for series in a user's library, are read
 * from releases the scheduler records (see `recordReleases`).
 *
 * @packageDocumentation
 */
export {
	addToLibrary,
	getLibrary,
	getLibraryEntry,
	LibraryStatusSchema,
	removeFromLibrary,
	type Library,
	type LibraryEntry,
	type LibraryItem,
	type LibraryStatus,
} from "./entries/entries";
export {
	dismissNotification,
	getNotifications,
	markNotificationsSeen,
	type Notification,
	type Notifications,
} from "./notifications/notifications";
export { recordReleases } from "./notifications/releases";
export { dismissFromContinueWatching, getContinueWatching } from "./progress/continue-watching";
export { forgetEpisode, getHistory, type HistoryItem, type HistoryPage } from "./progress/history";
export {
	clearProgress,
	getProgress,
	markWatched,
	MarkWatchedSchema,
	ProgressUpdateSchema,
	recordProgress,
	type MarkWatchedTarget,
	type ProgressUpdate,
} from "./progress/progress";
export type {
	ContinueWatchingItem,
	EpisodeProgress,
	NamedSeason,
	SeasonProgress,
	SeriesProgress,
	TitleProgress,
} from "./progress/resume";
export { getRecommendations } from "./recommendations/recommendations";
