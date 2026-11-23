import type { PlaybackPreferences } from "../models/library";
import type { PlaybackMedia } from "../models/playback";

/** The version to play and its subtitle track, either missing when there is none. */
export interface PlaybackChoice<TMedia extends Pick<PlaybackMedia, "audio" | "subtitles">> {
	media: TMedia | undefined;
	subtitle: TMedia["subtitles"][number] | undefined;
}

/**
 * What a player shows of an episode for a profile's playback preferences:
 * the version in its preferred audio, else the next best (a dub falls back to
 * sub, then raw; a sub to raw, then dub; no preference is the first one), and that version's
 * subtitle track, as {@link PlaybackPreferences.subtitles} picks it: the
 * chosen variant, language and kind when available, then the same language
 * or another region of it, then the version's default.
 * No track when the profile turned subtitles off for the audio, or
 * for raw, which has none.
 *
 * Needs nothing but the playback and the preferences, so a player can choose
 * again as soon as the preferences change, without resolving the episode
 * again.
 */
export const chooseVersion = <TMedia extends Pick<PlaybackMedia, "audio" | "subtitles">>(
	media: readonly TMedia[],
	preferences: Pick<PlaybackPreferences, "audio" | "subtitles">,
): PlaybackChoice<TMedia> => {
	/** The audios to try, in order, for each preferred audio; raw is the last resort of a dub. */
	const fallbacks = {
		dub: ["dub", "sub", "raw"],
		raw: ["raw", "sub", "dub"],
		sub: ["sub", "raw", "dub"],
	} as const;

	const version =
		(preferences.audio &&
			fallbacks[preferences.audio]
				.map((audio) => media.find((candidate) => candidate.audio === audio))
				.find((candidate) => candidate !== undefined)) ||
		media[0];

	let choice: PlaybackPreferences["subtitles"]["sub" | "dub"] | null = null;

	if (version && version.audio !== "raw") {
		choice = preferences.subtitles[version.audio];
	}

	let subtitle: TMedia["subtitles"][number] | undefined;

	if (version && choice !== null) {
		const tracks = version.subtitles;

		if (choice) {
			const matching = tracks.filter((track) => track.language === choice.language);
			const matchingKind = matching.filter((track) => track.kind === choice.kind);
			const [language] = choice.language.split("-");

			if (choice.variant) {
				subtitle = matchingKind.find((track) => track.variant === choice.variant);
			}

			subtitle ??=
				matchingKind[0] ??
				matching[0] ??
				tracks.find(
					(track) => track.language.split("-")[0] === language && track.kind === choice.kind,
				) ??
				tracks.find((track) => track.language.split("-")[0] === language);
		}

		subtitle ??= tracks.find((track) => track.default);
	}

	return {
		media: version,
		subtitle,
	};
};
