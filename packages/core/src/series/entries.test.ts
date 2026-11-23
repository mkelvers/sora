import { expect, mock, test } from "bun:test";

import type {
	FranchiseEntryFragment,
	FranchiseEntryWithNeighboursFragment,
} from "../anilist/graphql.generated";
import { loadByIds, toMatchSubject } from "./entries";

/** An AniList entry that knows nothing but its ID. */
class Entry {
	readonly #id: number;

	constructor(id: number) {
		this.#id = id;
	}

	get fragment(): FranchiseEntryFragment {
		return {
			averageScore: null,
			bannerImage: null,
			coverImage: null,
			duration: null,
			endDate: null,
			episodes: null,
			format: "TV",
			genres: null,
			id: this.#id,
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
				romaji: `Entry ${this.#id}`,
			},
		};
	}

	/** The entry with its neighbours, as AniList sends it: entry 1 has entry 2, the rest none. */
	get loaded(): FranchiseEntryWithNeighboursFragment {
		let relatedIds: number[] = [];

		if (this.#id === 1) {
			relatedIds = [2];
		}

		return {
			...this.fragment,
			neighbours: {
				edges: relatedIds.map((related) => ({
					node: {
						...new Entry(related).fragment,
						type: "ANIME",
					},
				})),
			},
		};
	}
}

test("asks AniList only for entries it has not loaded recently", async () => {
	const load = mock((ids: Iterable<number>) =>
		Promise.resolve(new Map([...ids].map((id) => [id, new Entry(id).loaded]))),
	);

	await loadByIds([100], load);
	await loadByIds([100], load);
	const loaded = await loadByIds([100, 101], load);

	expect(load.mock.calls.map(([ids]) => [...ids])).toEqual([[100], [101]]);
	expect([...loaded.keys()]).toEqual([100, 101]);
});

test("answers a later request for a neighbour from the one that brought it", async () => {
	const load = mock((ids: Iterable<number>) =>
		Promise.resolve(new Map([...ids].map((id) => [id, new Entry(id).loaded]))),
	);

	await loadByIds([1], load);
	const neighbours = await loadByIds([2], load);

	expect(load).toHaveBeenCalledTimes(1);
	expect(neighbours.get(2)?.id).toBe(2);
});

test("leaves the length of an entry that has not aired unknown", () => {
	const upcoming: FranchiseEntryFragment = {
		...new Entry(102).fragment,
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
