/**
 * What Sora keeps per profile: the titles featured on its home page, its
 * playback preferences, its Shows, its progress through the episodes it
 * played, and its history of the episodes it finished.
 *
 * Every function takes an opaque `userId` from the caller's identity layer.
 * The core trusts it, so callers must authenticate before calling.
 *
 * @packageDocumentation
 */
export { getFeatured } from "./featured/featured";
export {
	getPlaybackPreferences,
	PlaybackPreferencesUpdateSchema,
	updatePlaybackPreferences,
	type PlaybackPreferences,
	type PlaybackPreferencesUpdate,
	type SubtitleChoice,
} from "./preferences/preferences";
export { getHistory, type HistoryItem, type HistoryPage } from "./progress/history";
export {
	getContinueWatching,
	getProgress,
	getSeriesProgress,
	ProgressInputSchema,
	dismissContinueWatching,
	markEpisode,
	markSeason,
	unmarkEpisode,
	unmarkSeason,
	saveProgress,
	type ContinueWatching,
	type NextEpisode,
	type Progress,
	type ProgressInput,
	type SeriesProgress,
} from "./progress/progress";
export {
	addShow,
	dropShow,
	getDropped,
	getShows,
	removeShow,
	undropShow,
	type Dropped,
	type Show,
} from "./shows/shows";
