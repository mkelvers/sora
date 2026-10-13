import { describe, expect, test } from "bun:test";

import type { Anime } from "../../catalog/models/anime";
import { acceptsTitleMatch, SdkStreamProvider } from "./sdk";

function anime(titles: { english?: string; romaji?: string }, episodes: number | null) {
	return {
		id: 1,
		malId: null,
		title: {
			english: titles.english ?? null,
			romaji: titles.romaji ?? null,
			native: null,
		},
		synonyms: [],
		episodes,
		status: "FINISHED",
		startDate: null,
		seasonYear: null,
		format: "TV",
	} as unknown as Anime;
}

const titan = anime(
	{
		english: "Attack on Titan Season 2",
		romaji: "Shingeki no Kyojin 2",
	},
	12,
);

describe("acceptsTitleMatch", () => {
	test("takes the same season with about the same episodes", () => {
		expect(acceptsTitleMatch(titan, "Attack on Titan Season 2", 12)).toBe(true);
		expect(acceptsTitleMatch(titan, "Attack on Titan Season 2", 14)).toBe(true);
	});

	test("refuses another season however alike the title is", () => {
		expect(acceptsTitleMatch(titan, "Attack on Titan Season 3", 12)).toBe(false);
		expect(acceptsTitleMatch(titan, "Attack on Titan", 25)).toBe(false);
	});

	// Each pair below was a stored fuzzy mapping before the guard.
	test("refuses the neighbouring season of real mappings", () => {
		const cases = [
			[anime({ english: "GOBLIN SLAYER" }, 12), "GOBLIN SLAYER II", 12],
			[anime({ english: "Lupin the 3rd Part IV" }, 24), "Lupin the 3rd Part V", 24],
			[anime({ english: "Love Live! Superstar!!" }, 12), "Love Live! Superstar!! Season 2", 12],
			[anime({ english: "Little Shark's Day Out" }, 60), "Little Shark's Day Out Season 2", 25],
			[anime({ english: "Kuroko's Basketball: Tip Off" }, 1), "Kuroko's Basketball 3", 25],
		] as const;
		for (const [wanted, matched, units] of cases) {
			expect(acceptsTitleMatch(wanted, matched, units)).toBe(false);
		}
	});

	test("refuses a whole series standing in for a special, film or OVA", () => {
		const cases = [
			[anime({ english: "Asobi Asobase OVA" }, 1), "Asobi Asobase - workshop of fun -", 12],
			[anime({ romaji: "Durarara!! Specials" }, 2), "Durarara!!", 24],
			[anime({ romaji: "Aldnoah.Zero (Re+)" }, 1), "Aldnoah.Zero", 12],
		] as const;
		for (const [wanted, matched, units] of cases) {
			expect(acceptsTitleMatch(wanted, matched, units)).toBe(false);
		}
	});

	test("keeps a right title whose list is short or empty", () => {
		const quintuplets = anime({ english: "The Quintessential Quintuplets" }, 12);
		expect(acceptsTitleMatch(quintuplets, "The Quintessential Quintuplets*", 2)).toBe(true);
		expect(acceptsTitleMatch(quintuplets, "The Quintessential Quintuplets*", 0)).toBe(true);
	});

	test("takes numbers written as numerals or words as the same instalment", () => {
		const slime = anime({ english: "Slime Season 3" }, 12);
		expect(acceptsTitleMatch(slime, "Slime Season III", 12)).toBe(true);
		expect(acceptsTitleMatch(slime, "Slime Season Three", 12)).toBe(true);
		expect(acceptsTitleMatch(slime, "Slime Season Two", 12)).toBe(false);
	});

	test("takes any length when AniList does not know the count", () => {
		const unknown = anime({ english: "Attack on Titan Season 2" }, null);
		expect(acceptsTitleMatch(unknown, "Attack on Titan Season 2", 300)).toBe(true);
	});
});

/** A provider whose search and episode list are stood in for, to see what `findMedia` does with them. */
function providerFinding(resolution: object | null, units: Promise<unknown[]>) {
	const fetched: string[] = [];
	const provider = new SdkStreamProvider(
		{
			id: "stub",
			fetchContentUnits: (id: string) => {
				fetched.push(id);
				return units;
			},
		} as never,
		{
			resolveProviderMediaId: async () => resolution,
		} as never,
		{
			locale: "en",
			listsLanguages: true,
		},
	);
	return {
		provider,
		fetched,
	};
}

const resolved = (method: string, matchedTitle: string) => ({
	rawMediaId: "abc",
	matchedTitle,
	method,
});

describe("SdkStreamProvider.findMedia", () => {
	test("finds nothing when the provider finds nothing", async () => {
		const { provider, fetched } = providerFinding(null, Promise.resolve([]));
		expect(await provider.findMedia(titan)).toBeNull();
		expect(fetched).toEqual([]);
	});

	test("trusts an ID match without fetching its episodes", async () => {
		const { provider, fetched } = providerFinding(
			resolved("anilist_id", "Anything At All"),
			Promise.resolve([]),
		);
		expect(await provider.findMedia(titan)).toEqual({
			mediaId: "abc",
			matchedTitle: "Anything At All",
			method: "anilist_id",
			episodeOffset: 0,
		});
		expect(fetched).toEqual([]);
	});

	test("keeps a title match that fits, checking its episodes under the provider's ID", async () => {
		const { provider, fetched } = providerFinding(
			resolved("fuzzy", "Attack on Titan Season 2"),
			Promise.resolve(Array.from({ length: 12 })),
		);
		expect((await provider.findMedia(titan))?.mediaId).toBe("abc");
		expect(fetched).toEqual(["stub:abc"]);
	});

	test("drops a title match for another season", async () => {
		const { provider } = providerFinding(
			resolved("fuzzy", "Attack on Titan Season 3"),
			Promise.resolve(Array.from({ length: 12 })),
		);
		expect(await provider.findMedia(titan)).toBeNull();
	});

	test("drops a title match whose list runs far past the anime's episodes", async () => {
		const { provider } = providerFinding(
			resolved("fuzzy", "Attack on Titan Season 2"),
			Promise.resolve(Array.from({ length: 40 })),
		);
		expect(await provider.findMedia(titan)).toBeNull();
	});

	test("fails, rather than finding nothing, when the episode list cannot be fetched", async () => {
		const { provider } = providerFinding(
			resolved("fuzzy", "Attack on Titan Season 2"),
			Promise.reject(new Error("provider down")),
		);
		await expect(provider.findMedia(titan)).rejects.toThrow("provider down");
	});
});
