import type { PlaybackPreferences } from "../models/library";
import type { PlaybackMedia } from "../models/playback";

/** The audios to try, in order, for each preferred audio; raw is the last resort of a dub. */
const fallbacks = {
	dub: ["dub", "sub", "raw"],
	raw: ["raw", "sub", "dub"],
	sub: ["sub", "raw", "dub"],
} as const;

/**
 * What a player shows of an episode for a profile's playback preferences:
 * the version in its preferred audio, else the next best (a dub falls back to
 * sub, then raw; a sub to raw, then dub; no preference is the first one), and that version's
 * subtitle track, as {@link PlaybackPreferences.subtitles} picks it: the
 * chosen language and kind, else the chosen language, else the version's
 * default. No track when the profile turned subtitles off for the audio, or
 * for raw, which has none.
 *
 * Needs nothing but the playback and the preferences, so a player can choose
 * again as soon as the preferences change, without resolving the episode
 * again.
 */
export const choosePlayback = <TMedia extends Pick<PlaybackMedia, "audio" | "subtitles">>(
	media: readonly TMedia[],
	preferences: Pick<PlaybackPreferences, "audio" | "subtitles">,
): {
	media: TMedia | undefined;
	subtitle: TMedia["subtitles"][number] | undefined;
} => {
	const version =
		(preferences.audio &&
			fallbacks[preferences.audio]
				.map((audio) => media.find((version) => version.audio === audio))
				.find((version) => version !== undefined)) ||
		media[0];
	const choice = version && version.audio !== "raw" ? preferences.subtitles[version.audio] : null;
	let subtitle: TMedia["subtitles"][number] | undefined;

	if (version && choice !== null) {
		const tracks = version.subtitles;
		if (choice) {
			// Prefer the exact track, then any track in the chosen language.
			subtitle =
				tracks.find((track) => track.language === choice.language && track.kind === choice.kind) ??
				tracks.find((track) => track.language === choice.language);
		}
		subtitle ??= tracks.find((track) => track.default);
	}

	return {
		media: version,
		subtitle,
	};
};
