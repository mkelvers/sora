/**
 * What Sora keeps per profile: the titles featured on its home page, its
 * playback preferences, and its progress through the episodes it played.
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
export {
	getContinueWatching,
	getProgress,
	getSeriesProgress,
	ProgressInputSchema,
	removeProgress,
	saveProgress,
	type ContinueWatching,
	type NextEpisode,
	type Progress,
	type ProgressInput,
	type SeriesProgress,
} from "./progress/progress";
