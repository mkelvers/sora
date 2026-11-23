import type { MappingMethod, MappingResolution } from "anime-sdk";

import type { Anime } from "../../catalog/models/anime";
import { anime } from "../../catalog/models/anime.fixture";

/** A finished TV anime with `titles` and `episodes` episodes. */
export const titled = (
	titles: {
		english?: string;
		romaji?: string;
	},
	episodes: number | null,
): Anime => ({
	...anime(1),
	episodes,
	format: "TV",
	status: "FINISHED",
	title: {
		display: titles.english ?? titles.romaji ?? "",
		english: titles.english ?? null,
		native: null,
		romaji: titles.romaji ?? null,
	},
});

/** The stub provider's mapping client finding series `abc` as `matchedTitle`. */
export const resolved = (method: MappingMethod, matchedTitle: string): MappingResolution => ({
	matchedTitle,
	method,
	providerId: "stub",
	rawMediaId: "abc",
});
