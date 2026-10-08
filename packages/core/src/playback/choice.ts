import type { PlaybackPreferences } from "../models/library";
import type { PlaybackMedia } from "../models/playback";

/**
 * What a player shows of an episode for a profile's playback preferences:
 * the version in its preferred audio, else the first one, and that version's
 * subtitle track, as {@link PlaybackPreferences.subtitles} picks it: the
 * chosen language and kind, else the chosen language, else the version's
 * default. No track when the profile turned subtitles off for the audio, or
 * for raw, which has none.
 *
 * Needs nothing but the playback and the preferences, so a player can choose
 * again as soon as the preferences change, without resolving the episode
 * again.
 */
export function choosePlayback<TMedia extends Pick<PlaybackMedia, "audio" | "subtitles">>(
	media: readonly TMedia[],
	preferences: Pick<PlaybackPreferences, "audio" | "subtitles">,
): {
	media: TMedia | undefined;
	subtitle: TMedia["subtitles"][number] | undefined;
} {
	const chosen = media.find((version) => version.audio === preferences.audio) ?? media[0];
	if (!chosen || chosen.audio === "raw") {
		return {
			media: chosen,
			subtitle: undefined,
		};
	}

	const choice = preferences.subtitles[chosen.audio];
	const tracks = chosen.subtitles;
	return {
		media: chosen,
		subtitle:
			choice === null
				? undefined
				: ((choice &&
						(tracks.find(
							(track) => track.language === choice.language && track.kind === choice.kind,
						) ??
							tracks.find((track) => track.language === choice.language))) ??
					tracks.find((track) => track.default)),
	};
}
