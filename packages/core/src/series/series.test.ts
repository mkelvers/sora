import { describe, expect, mock, test } from "bun:test";

mock.module("../database/client", () => ({
	db: {},
}));

const { layoutEpisodes } = await import("./series");

const finished = {
	episodes: 3,
	nextEpisode: null,
	durationMinutes: 24,
};

/** A TMDB show whose second season holds the episodes an entry is matched to. */
const show = {
	episodes: [1, 2, 3].map((number) => ({
		id: 9000 + number,
		season_number: 2,
		episode_number: number,
		name: `Chapter ${number}`,
		overview: `What happens in chapter ${number}`,
		air_date: `2026-01-0${number}`,
		runtime: 23,
		still_path: `/still-${number}.jpg`,
	})),
};

const links = [1, 2, 3].map((number) => ({
	anilistEpisode: number,
	seasonNumber: 2,
	episodeNumber: number,
}));

describe("layoutEpisodes", () => {
	test("numbers episodes as AniList does, each with its TMDB episode's details", () => {
		const episodes = layoutEpisodes(finished, links, show, null);

		expect(episodes.map((episode) => episode.number)).toEqual([1, 2, 3]);
		expect(episodes[1]).toMatchObject({
			title: "Chapter 2",
			overview: "What happens in chapter 2",
			airDate: "2026-01-02",
			runtimeMinutes: 23,
			tmdb: {
				seasonNumber: 2,
				episodeNumber: 2,
			},
		});
		expect(episodes[1]?.stillUrl).toEndWith("/still-2.jpg");
	});

	test("keeps an episode TMDB does not list, bare", () => {
		const episodes = layoutEpisodes(finished, links.slice(0, 2), show, null);

		expect(episodes[2]).toEqual({
			number: 3,
			title: null,
			overview: null,
			airDate: null,
			runtimeMinutes: 24,
			stillUrl: null,
			tmdb: null,
		});
	});

	test("lays out an entry TMDB does not list with AniList's count alone", () => {
		expect(layoutEpisodes(finished, [], null, null)).toHaveLength(3);
	});

	test("counts the episodes aired so far while AniList does not know the total", () => {
		const airing = {
			episodes: null,
			nextEpisode: {
				number: 6,
				airingAt: "2026-10-03T15:00:00.000Z",
			},
			durationMinutes: 24,
		};

		expect(layoutEpisodes(airing, [], null, null)).toHaveLength(5);
	});

	test("never lays out fewer episodes than were matched to TMDB, or than one", () => {
		const unknown = {
			episodes: null,
			nextEpisode: null,
			durationMinutes: null,
		};

		expect(layoutEpisodes(unknown, links, show, null)).toHaveLength(3);
		expect(layoutEpisodes(unknown, [], null, null)).toHaveLength(1);
	});

	test("gives a film TMDB lists on its own the film's details", () => {
		const [episode, ...rest] = layoutEpisodes(
			{
				episodes: 1,
				nextEpisode: null,
				durationMinutes: 100,
			},
			[],
			null,
			{
				title: "Scarlet Bond",
				overview: "A film",
				release_date: "2022-11-25",
				runtime: 114,
				backdrop_path: "/backdrop.jpg",
			},
		);

		expect(rest).toHaveLength(0);
		expect(episode).toMatchObject({
			number: 1,
			title: "Scarlet Bond",
			overview: "A film",
			airDate: "2022-11-25",
			runtimeMinutes: 114,
			tmdb: null,
		});
		expect(episode?.stillUrl).toEndWith("/backdrop.jpg");
	});
});
