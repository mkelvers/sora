import { beforeEach, expect, test } from "bun:test";

import { loadEntries, toMatchSubject } from "./entries";

/** The `ids` of each FranchiseEntries request, in order. */
const requests: number[][] = [];

/** An AniList entry with `relatedIds` as its neighbours, loaded in full. */
function media(id: number, relatedIds: number[] = []) {
	const entry = (entryId: number) => ({
		id: entryId,
		title: {
			romaji: `Entry ${entryId}`,
			english: null,
			native: null,
		},
		format: "TV",
		isAdult: false,
		relations: {
			edges: [],
		},
	});
	return {
		...entry(id),
		neighbours: {
			edges: relatedIds.map((related) => ({
				node: {
					type: "ANIME",
					...entry(related),
				},
			})),
		},
	};
}

async function load(ids: Iterable<number>) {
	const asked = [...ids];
	requests.push(asked);
	return new Map(asked.map((id) => [id, media(id, id === 1 ? [2] : [])])) as never;
}

let nextId = 100;
beforeEach(() => {
	requests.length = 0;
});

test("asks AniList only for entries it has not loaded recently", async () => {
	const [first, second] = [nextId++, nextId++];

	await loadEntries([first], load);
	const loaded = await loadEntries([first, second], load);

	expect(requests).toEqual([[first], [second]]);
	expect([...loaded.keys()]).toEqual([first, second]);
});

test("answers a later request for a neighbour from the one that brought it", async () => {
	await loadEntries([1], load);
	const neighbours = await loadEntries([2], load);

	expect(requests).toEqual([[1]]);
	expect(neighbours.get(2)?.id).toBe(2);
});

test("leaves the length of an entry that has not aired unknown", async () => {
	const upcoming = {
		...media(nextId++),
		status: "NOT_YET_RELEASED",
		episodes: null,
		nextAiringEpisode: {
			episode: 1,
			airingAt: 0,
		},
	};
	const airing = {
		...upcoming,
		status: "RELEASING",
		nextAiringEpisode: {
			episode: 4,
			airingAt: 0,
		},
	};

	expect(toMatchSubject(upcoming as never, new Date()).episodes).toBeNull();
	expect(toMatchSubject(airing as never, new Date()).episodes).toBe(3);
});
