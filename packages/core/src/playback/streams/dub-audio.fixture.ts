import type { ProviderUnit } from "../episodes/episodes";
import type { ProviderVideo } from "../providers/provider";

/** A video at `url` with no subtitles. */
export const video = (url: string, format: ProviderVideo["format"] = "hls"): ProviderVideo => ({
	format,
	headers: {},
	quality: "auto",
	subtitles: [],
	url,
});

/** An episode as a provider lists it, in `languages`. */
export const unit = (number: number, languages: ProviderUnit["languages"]): ProviderUnit => ({
	addedAt: null,
	id: `anikoto:${number}`,
	isFiller: false,
	languages,
	number,
	title: `Episode ${number}`,
});
