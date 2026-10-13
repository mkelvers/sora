import { expect, mock, test } from "bun:test";

import type {
	FranchiseEntryFragment,
	FranchiseEntryWithNeighboursFragment,
} from "../anilist/graphql.generated";
import { loadEntries, toMatchSubject } from "./entries";

/** An AniList entry that knows nothing but its ID. */
function entry(id: number): FranchiseEntryFragment {
	return {
		id,
		idMal: null,
		synonyms: null,
		bannerImage: null,
		format: "TV",
		status: null,
		season: null,
		seasonYear: null,
		episodes: null,
		duration: null,
		averageScore: null,
		popularity: null,
		genres: null,
		isAdult: false,
		startDate: null,
		endDate: null,
		relations: {
			edges: [],
		},
		title: {
			romaji: `Entry ${id}`,
			english: null,
			native: null,
		},
		coverImage: null,
		nextAiringEpisode: null,
	};
}

/** An entry with `relatedIds` as its neighbours, as AniList sends it. */
function withNeighbours(id: number, relatedIds: number[]): FranchiseEntryWithNeighboursFragment {
	return {
		...entry(id),
		neighbours: {
			edges: relatedIds.map((related) => ({
				node: {
					...entry(related),
					type: "ANIME",
				},
			})),
		},
	};
}

/** A loader that answers every ID with an entry, entry 1 with entry 2 as its neighbour. */
const loader = () =>
	mock(
		async (ids: Iterable<number>) =>
			new Map([...ids].map((id) => [id, withNeighbours(id, id === 1 ? [2] : [])])),
	);

test("asks AniList only for entries it has not loaded recently", async () => {
	const load = loader();

	await loadEntries([100], load);
	await loadEntries([100], load);
	const loaded = await loadEntries([100, 101], load);

	expect(load.mock.calls.map(([ids]) => [...ids])).toEqual([[100], [101]]);
	expect([...loaded.keys()]).toEqual([100, 101]);
});

test("answers a later request for a neighbour from the one that brought it", async () => {
	const load = loader();

	await loadEntries([1], load);
	const neighbours = await loadEntries([2], load);

	expect(load).toHaveBeenCalledTimes(1);
	expect(neighbours.get(2)?.id).toBe(2);
});

test("leaves the length of an entry that has not aired unknown", () => {
	const upcoming: FranchiseEntryFragment = {
		...entry(102),
		status: "NOT_YET_RELEASED",
		nextAiringEpisode: {
			episode: 1,
			airingAt: 0,
		},
	};
	const airing: FranchiseEntryFragment = {
		...upcoming,
		status: "RELEASING",
		nextAiringEpisode: {
			episode: 4,
			airingAt: 0,
		},
	};

	expect(toMatchSubject(upcoming, new Date()).episodes).toBeNull();
	expect(toMatchSubject(airing, new Date()).episodes).toBe(3);
});
