import { expect, test } from "bun:test";

import { createTmdbClient } from "./client";
import { getShowEpisodeGroups } from "./resources";

const episode = {
	id: 1,
	season_number: 5,
	episode_number: 13,
	name: "Smack of Love and Revenge",
	overview: null,
	air_date: "2022-10-08",
	runtime: 24,
	still_path: null,
	order: 0,
};
const responses: Record<string, unknown> = {
	"/tv/45790/episode_groups": { results: [{ id: "anime-parts", type: 1 }] },
	"/tv/episode_group/anime-parts": {
		groups: [
			{ name: "Part 3", order: 3, episodes: [{ ...episode, id: 3, episode_number: 25 }] },
			{
				name: "Part 2",
				order: 2,
				episodes: [{ ...episode, id: 2, episode_number: 14, order: 1 }, episode],
			},
		],
	},
	"/tv/1/episode_groups": { results: [] },
};
/** The paths TMDB was asked for, in order. */
const requests: string[] = [];

const { tmdb } = createTmdbClient({
	fetch: async (url) => {
		const path = url.pathname.replace("/3", "");
		requests.push(path);
		return Response.json(responses[path]);
	},
	store: {
		find: async () => undefined,
		save: async () => undefined,
	},
});

test("loads episode groups in order and retains canonical episode numbers", async () => {
	const arrangements = await getShowEpisodeGroups(45790, tmdb);
	expect(
		arrangements.map((groups) =>
			groups.map((group) => ({
				name: group.name,
				episodes: group.episodes.map((entry) => `${entry.season_number}:${entry.episode_number}`),
			})),
		),
	).toEqual([
		[
			{ name: "Part 2", episodes: ["5:13", "5:14"] },
			{ name: "Part 3", episodes: ["5:25"] },
		],
	]);
	expect(requests).toEqual(["/tv/45790/episode_groups", "/tv/episode_group/anime-parts"]);
});

test("makes no detail requests for shows without episode groups", async () => {
	requests.length = 0;
	expect(await getShowEpisodeGroups(1, tmdb)).toEqual([]);
	expect(requests).toEqual(["/tv/1/episode_groups"]);
});
