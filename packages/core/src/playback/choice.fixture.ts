import type { PlaybackMedia } from "../models/playback";

/** A subtitle track in `language`. */
export const track = (
	language: string,
	kind: "dialogue" | "signs" | null,
	isDefault = false,
): PlaybackMedia["subtitles"][number] => ({
	default: isDefault,
	format: "vtt",
	kind,
	label: language,
	language,
	url: `${language}-${kind}`,
});
