/**
 * What Sora keeps per profile: the titles featured on its home page and its
 * playback preferences. Nothing about what a profile watched is kept.
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
