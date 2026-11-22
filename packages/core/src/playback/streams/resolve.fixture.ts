import type { EpisodeVersion } from "../episodes/versions";

/** A sub in `locale`. */
export const sub = (locale = "en"): EpisodeVersion => ({
	language: "sub",
	locale,
});

/** A dub in `locale`. */
export const dub = (locale = "en"): EpisodeVersion => ({
	language: "dub",
	locale,
});
