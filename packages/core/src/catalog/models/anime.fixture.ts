import type { Anime } from "./anime";

/** An anime that knows nothing but its AniList ID, for tests. */
export const anime = (id: number): Anime => {
	return {
		bannerUrl: null,
		countryOfOrigin: null,
		coverColor: null,
		coverUrl: null,
		description: null,
		durationMinutes: null,
		endDate: null,
		episodes: null,
		format: null,
		genres: [],
		id,
		isAdult: false,
		malId: null,
		nextEpisode: null,
		popularity: null,
		recommendations: [],
		relations: [],
		score: null,
		season: null,
		seasonYear: null,
		source: null,
		startDate: null,
		status: null,
		studios: [],
		synonyms: [],
		tags: [],
		title: {
			display: `Anime ${id}`,
			english: null,
			native: null,
			romaji: null,
		},
	};
};
