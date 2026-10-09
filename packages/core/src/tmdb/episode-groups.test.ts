import { expect, mock, test } from "bun:test";

import type { z } from "zod";

const requests: string[] = [];
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
mock.module("./client", () => ({
	tmdb: async (path: string, _query: Record<string, string>, schema: z.ZodType) => {
		requests.push(path);
		return schema.parse(responses[path]);
	},
}));
const { getShowEpisodeGroups } = await import("./resources");

test("loads episode groups in order and retains canonical episode numbers", async () => {
	const arrangements = await getShowEpisodeGroups(45790);
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
	expect(await getShowEpisodeGroups(1)).toEqual([]);
	expect(requests).toEqual(["/tv/1/episode_groups"]);
});
