import type { TmdbEpisode, TmdbMovieResult } from "../tmdb/resources";
import { bestSimilarity } from "./matching";
import type { MatchSubject, placeInShow, ShowCandidate } from "./matching";

/** A weekly run of TMDB episodes, numbered from `first`. Dates are `null` when `start` is. */
export const weekly = (
	season: number,
	start: string | null,
	count: number,
	options: {
		first?: number;
		runtime?: number;
	} = {},
): TmdbEpisode[] => {
	const first = options.first ?? 1;

	return Array.from(
		{
			length: count,
		},
		(_, index) => {
			let airDate: string | null = null;

			if (start) {
				const days = index * 7;
				airDate = new Date(Date.parse(`${start}T00:00:00Z`) + days * 86_400_000)
					.toISOString()
					.slice(0, 10);
			}

			return {
				air_date: airDate,
				episode_number: first + index,
				id: season * 10_000 + first + index,
				name: null,
				overview: null,
				runtime: options.runtime ?? 24,
				season_number: season,
				still_path: null,
			};
		},
	);
};

export const special = (episode: number, airDate: string, runtime: number): TmdbEpisode => ({
	air_date: airDate,
	episode_number: episode,
	id: episode,
	name: null,
	overview: null,
	runtime,
	season_number: 0,
	still_path: null,
});

export const subject = (overrides: Partial<MatchSubject>): MatchSubject => {
	const titles = overrides.titles ?? ["Example"];

	return {
		airsFrom: null,
		durationMinutes: 24,
		endDate: null,
		episodes: null,
		format: "TV",
		primaryTitleCount: titles.length,
		startDate: null,
		...overrides,
		titles,
	};
};

export const show = (
	episodes: TmdbEpisode[],
	overrides: Partial<ShowCandidate> = {},
): ShowCandidate => ({
	isFranchiseShow: false,
	prequel: null,
	show: {
		episodes,
		id: 1,
		name: "Example",
		originalName: "Example",
	},
	...overrides,
});

/** A prequel run through a season up to `episode`, from the season's first episode. */
export const endingAt = (season: number, episode: number) => ({
	first: {
		episodeNumber: 1,
		seasonNumber: season,
	},
	last: {
		episodeNumber: episode,
		seasonNumber: season,
	},
});

export const movie = (overrides: Partial<TmdbMovieResult>): TmdbMovieResult => ({
	id: 1,
	original_title: "Example",
	popularity: 1,
	release_date: null,
	title: "Example",
	...overrides,
});

export const range = (placement: ReturnType<typeof placeInShow>) => {
	if (placement?.mediaType !== "tv") {
		return null;
	}

	return placement.episodes.map(
		(link) => `${link.anilistEpisode}:S${link.seasonNumber}E${link.episodeNumber}`,
	);
};

// Haikyu!!: TMDB dates Land vs. Air twelve days after AniList, and Lev
// Appears four months after, beyond the air-date window.
export const named = (episode: number, airDate: string, name: string) => ({
	...special(episode, airDate, 24),
	name,
});

export const haikyu = (overrides: Partial<ShowCandidate> = {}): ShowCandidate => ({
	isFranchiseShow: true,
	prequel: null,
	show: {
		episodes: [
			...weekly(1, "2014-04-06", 3),
			named(1, "2015-03-04", "Lev Appears!"),
			named(2, "2020-01-22", "Land vs. Air"),
			named(3, "2020-01-22", "The Path of the Ball"),
			named(4, "2020-03-04", "Puppet Theatre"),
		],
		id: 60_863,
		name: "Haikyu!!",
		originalName: "ハイキュー!!",
	},
	...overrides,
});

export const same = (a: string, b: string) => bestSimilarity([a], [b], { sameNumbers: true }) > 0;

// TONIKAWA: AniList has High School Days from 2023-07-12, and TMDB files
// its four episodes under specials from 2023-08-02. Both end on 2023-08-23.
export const tonikawa = (
	specials: TmdbEpisode[],
	overrides: Partial<ShowCandidate> = {},
): ShowCandidate => ({
	isFranchiseShow: true,
	prequel: endingAt(2, 12),
	show: {
		episodes: [
			...weekly(1, "2020-10-03", 12),
			...weekly(2, "2023-04-08", 12),
			special(14, "2021-08-18", 24),
			special(15, "2022-11-22", 22),
			...specials,
		],
		id: 100_049,
		name: "TONIKAWA: Over The Moon For You",
		originalName: "トニカクカワイイ",
	},
	...overrides,
});
