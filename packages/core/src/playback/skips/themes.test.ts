import { describe, expect, test } from "bun:test";

import { playsIn, songsForEpisode } from "./themes";
import type { ThemeSong } from "./themes";

describe("playsIn", () => {
	test.each([
		["1-12", 5, true],
		["1-12", 13, false],
		["1-12, 14-25", 14, true],
		["1-12, 14-25", 13, false],
		["1206-", 1212, true],
		["1206-", 1205, false],
		["7, 12", 12, true],
		["7, 12", 8, false],
		[null, 3, true],
		["", 3, true],
	] as const)("%p includes episode %p: %p", (episodes, episode, expected) => {
		expect(playsIn(episodes, episode)).toBe(expected);
	});
});

const song = (kind: ThemeSong["kind"], slug: string, episodes: string | null): ThemeSong => ({
	audioUrl: `https://a.animethemes.moe/${slug}.ogg`,
	episodes,
	kind,
	slug,
});

describe("songsForEpisode", () => {
	test("takes the songs listed for the episode", () => {
		const songs = [
			song("opening", "OP1", "1-12"),
			song("opening", "OP2", "13-24"),
			song("ending", "ED1", "1-24"),
		];

		expect(songsForEpisode(songs, 14).map(({ slug }) => slug)).toEqual(["OP2", "ED1"]);
	});

	test("takes every song of a kind none is listed for, since episode lists are often unfinished", () => {
		// Mob Psycho 100: OP1 is listed for episodes 1–4 but opens all twelve.
		const songs = [song("opening", "OP1", "1-4"), song("ending", "ED1", "1-2, 4-7, 9-11")];

		expect(songsForEpisode(songs, 9).map(({ slug }) => slug)).toEqual(["OP1", "ED1"]);
	});

	test("takes none of a kind with many songs and none listed for the episode", () => {
		const songs = Array.from(
			{
				length: 30,
			},
			(_, index) => song("opening", `OP${index + 1}`, `${index * 10 + 1}-${index * 10 + 10}`),
		);

		expect(songsForEpisode(songs, 500)).toEqual([]);
	});
});
