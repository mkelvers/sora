import { describe, expect, test } from "bun:test";

import { layoutEpisodes } from "./series";

const finished = {
	durationMinutes: 24,
	episodes: 3,
	nextEpisode: null,
};

/** A TMDB show whose second season holds the episodes an entry is matched to. */
const show = {
	episodes: [1, 2, 3].map((number) => ({
		air_date: `2026-01-0${number}`,
		episode_number: number,
		id: 9000 + number,
		name: `Chapter ${number}`,
		overview: `What happens in chapter ${number}`,
		runtime: 23,
		season_number: 2,
		still_path: `/still-${number}.jpg`,
	})),
};

const links = [1, 2, 3].map((number) => ({
	anilistEpisode: number,
	episodeNumber: number,
	seasonNumber: 2,
}));

describe("layoutEpisodes", () => {
	test("uses AniKoto's playable count before larger AniList counts or stale TMDB links", () => {
		const episodes = layoutEpisodes(
			{
				durationMinutes: 5,
				episodes: 120,
				nextEpisode: null,
				playbackEpisodes: 3,
			},
			[...links, { anilistEpisode: 120, episodeNumber: 120, seasonNumber: 2 }],
			show,
			null,
		);
		expect(episodes).toHaveLength(3);
		expect(episodes[2]?.title).toBe("Chapter 3");
		expect(episodes[2]?.runtimeMinutes).toBe(23);
		expect(episodes[2]?.stillUrl).toEndWith("/still-3.jpg");
	});
	test("numbers episodes as AniList does, each with its TMDB episode's details", () => {
		const episodes = layoutEpisodes(finished, links, show, null);

		expect(episodes.map((episode) => episode.number)).toEqual([1, 2, 3]);
		expect(episodes[1]).toMatchObject({
			airDate: "2026-01-02",
			overview: "What happens in chapter 2",
			runtimeMinutes: 23,
			title: "Chapter 2",
			tmdb: {
				episodeNumber: 2,
				seasonNumber: 2,
			},
		});
		expect(episodes[1]?.stillUrl).toEndWith("/still-2.jpg");
	});

	test("keeps an episode TMDB does not list, bare", () => {
		const episodes = layoutEpisodes(finished, links.slice(0, 2), show, null);

		expect(episodes[2]).toEqual({
			airDate: null,
			number: 3,
			overview: null,
			runtimeMinutes: 24,
			stillUrl: null,
			title: null,
			tmdb: null,
		});
	});

	test("lays out an entry TMDB does not list with AniList's count alone", () => {
		expect(layoutEpisodes(finished, [], null, null)).toHaveLength(3);
	});

	test("counts the episodes aired so far while AniList does not know the total", () => {
		const airing = {
			durationMinutes: 24,
			episodes: null,
			nextEpisode: {
				airingAt: "2026-10-03T15:00:00.000Z",
				number: 6,
			},
		};

		expect(layoutEpisodes(airing, [], null, null)).toHaveLength(5);
	});

	test("never lays out fewer episodes than were matched to TMDB, or than one", () => {
		const unknown = {
			durationMinutes: null,
			episodes: null,
			nextEpisode: null,
		};

		expect(layoutEpisodes(unknown, links, show, null)).toHaveLength(3);
		expect(layoutEpisodes(unknown, [], null, null)).toHaveLength(1);
	});

	test("gives a film TMDB lists on its own the film's details", () => {
		const [episode, ...rest] = layoutEpisodes(
			{
				durationMinutes: 100,
				episodes: 1,
				nextEpisode: null,
			},
			[],
			null,
			{
				backdrop_path: "/backdrop.jpg",
				overview: "A film",
				release_date: "2022-11-25",
				runtime: 114,
				title: "Scarlet Bond",
			},
		);

		expect(rest).toHaveLength(0);
		expect(episode).toMatchObject({
			airDate: "2022-11-25",
			number: 1,
			overview: "A film",
			runtimeMinutes: 114,
			title: "Scarlet Bond",
			tmdb: null,
		});
		expect(episode?.stillUrl).toEndWith("/backdrop.jpg");
	});

	test("keeps the episodes of a special TMDB lists as a film bare", () => {
		const episodes = layoutEpisodes(
			{
				durationMinutes: 24,
				episodes: 2,
				nextEpisode: null,
			},
			[],
			null,
			{
				backdrop_path: "/backdrop.jpg",
				overview: "A film",
				release_date: "2024-09-20",
				runtime: 47,
				title: "Specials",
			},
		);

		expect(episodes).toHaveLength(2);
		expect(episodes[0]).toMatchObject({
			overview: null,
			runtimeMinutes: 24,
			stillUrl: null,
			title: null,
		});
	});
});
