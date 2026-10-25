import { expect, test } from "bun:test";

import { createTmdbClient } from "./client";
import { getShowEpisodeGroups } from "./resources";

const episode = {
	air_date: "2022-10-08",
	episode_number: 13,
	id: 1,
	name: "Smack of Love and Revenge",
	order: 0,
	overview: null,
	runtime: 24,
	season_number: 5,
	still_path: null,
};
const responses: Record<string, unknown> = {
	"/tv/1/episode_groups": { results: [] },
	"/tv/45790/episode_groups": { results: [{ id: "anime-parts", type: 1 }] },
	"/tv/episode_group/anime-parts": {
		groups: [
			{ episodes: [{ ...episode, episode_number: 25, id: 3 }], name: "Part 3", order: 3 },
			{
				episodes: [{ ...episode, episode_number: 14, id: 2, order: 1 }, episode],
				name: "Part 2",
				order: 2,
			},
		],
	},
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
		find: async () => {},
		save: async () => {},
	},
});

test("loads episode groups in order and retains canonical episode numbers", async () => {
	const arrangements = await getShowEpisodeGroups(45_790, tmdb);
	expect(
		arrangements.map((groups) =>
			groups.map((group) => ({
				episodes: group.episodes.map((entry) => `${entry.season_number}:${entry.episode_number}`),
				name: group.name,
			})),
		),
	).toEqual([
		[
			{ episodes: ["5:13", "5:14"], name: "Part 2" },
			{ episodes: ["5:25"], name: "Part 3" },
		],
	]);
	expect(requests).toEqual(["/tv/45790/episode_groups", "/tv/episode_group/anime-parts"]);
});

test("makes no detail requests for shows without episode groups", async () => {
	requests.length = 0;
	expect(await getShowEpisodeGroups(1, tmdb)).toEqual([]);
	expect(requests).toEqual(["/tv/1/episode_groups"]);
});
