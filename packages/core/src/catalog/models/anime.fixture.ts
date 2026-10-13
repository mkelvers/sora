import type { Anime } from "./anime";

/** An anime that knows nothing but its AniList ID, for tests. */
export function anime(id: number): Anime {
	return {
		id,
		malId: null,
		title: {
			display: `Anime ${id}`,
			english: null,
			romaji: null,
			native: null,
		},
		coverUrl: null,
		coverColor: null,
		bannerUrl: null,
		format: null,
		status: null,
		season: null,
		seasonYear: null,
		episodes: null,
		durationMinutes: null,
		score: null,
		popularity: null,
		genres: [],
		nextEpisode: null,
		isAdult: false,
		synonyms: [],
		description: null,
		source: null,
		countryOfOrigin: null,
		startDate: null,
		endDate: null,
		tags: [],
		studios: [],
		relations: [],
		recommendations: [],
	};
}
