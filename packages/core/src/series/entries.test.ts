import { expect, mock, test } from "bun:test";

import type {
	FranchiseEntryFragment,
	FranchiseEntryWithNeighboursFragment,
} from "../anilist/graphql.generated";
import { loadEntries, toMatchSubject } from "./entries";

/** An AniList entry that knows nothing but its ID. */
function entry(id: number): FranchiseEntryFragment {
	return {
		averageScore: null,
		bannerImage: null,
		coverImage: null,
		duration: null,
		endDate: null,
		episodes: null,
		format: "TV",
		genres: null,
		id,
		idMal: null,
		isAdult: false,
		nextAiringEpisode: null,
		popularity: null,
		relations: {
			edges: [],
		},
		season: null,
		seasonYear: null,
		startDate: null,
		status: null,
		synonyms: null,
		title: {
			english: null,
			native: null,
			romaji: `Entry ${id}`,
		},
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
		nextAiringEpisode: {
			airingAt: 0,
			episode: 1,
		},
		status: "NOT_YET_RELEASED",
	};
	const airing: FranchiseEntryFragment = {
		...upcoming,
		nextAiringEpisode: {
			airingAt: 0,
			episode: 4,
		},
		status: "RELEASING",
	};

	expect(toMatchSubject(upcoming, new Date()).episodes).toBeNull();
	expect(toMatchSubject(airing, new Date()).episodes).toBe(3);
});
