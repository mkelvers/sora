import { describe, expect, test } from "bun:test";

import type { IContentUnit, MappingMethod, MappingResolution } from "anime-sdk";

import type { Anime } from "../../catalog/models/anime";
import { anime } from "../../catalog/models/anime.fixture";
import { acceptsTitleMatch, SdkStreamProvider } from "./sdk";

function titled(titles: { english?: string; romaji?: string }, episodes: number | null): Anime {
	return {
		...anime(1),
		episodes,
		format: "TV",
		status: "FINISHED",
		title: {
			display: titles.english ?? titles.romaji ?? "",
			english: titles.english ?? null,
			native: null,
			romaji: titles.romaji ?? null,
		},
	};
}

const titan = titled(
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
			[titled({ english: "GOBLIN SLAYER" }, 12), "GOBLIN SLAYER II", 12],
			[titled({ english: "Lupin the 3rd Part IV" }, 24), "Lupin the 3rd Part V", 24],
			[titled({ english: "Love Live! Superstar!!" }, 12), "Love Live! Superstar!! Season 2", 12],
			[titled({ english: "Little Shark's Day Out" }, 60), "Little Shark's Day Out Season 2", 25],
			[titled({ english: "Kuroko's Basketball: Tip Off" }, 1), "Kuroko's Basketball 3", 25],
		] as const;
		for (const [wanted, matched, units] of cases) {
			expect(acceptsTitleMatch(wanted, matched, units)).toBe(false);
		}
	});

	test("refuses a whole series standing in for a special, film or OVA", () => {
		const cases = [
			[titled({ english: "Asobi Asobase OVA" }, 1), "Asobi Asobase - workshop of fun -", 12],
			[titled({ romaji: "Durarara!! Specials" }, 2), "Durarara!!", 24],
			[titled({ romaji: "Aldnoah.Zero (Re+)" }, 1), "Aldnoah.Zero", 12],
		] as const;
		for (const [wanted, matched, units] of cases) {
			expect(acceptsTitleMatch(wanted, matched, units)).toBe(false);
		}
	});

	test("keeps a right title whose list is short or empty", () => {
		const quintuplets = titled({ english: "The Quintessential Quintuplets" }, 12);
		expect(acceptsTitleMatch(quintuplets, "The Quintessential Quintuplets*", 2)).toBe(true);
		expect(acceptsTitleMatch(quintuplets, "The Quintessential Quintuplets*", 0)).toBe(true);
	});

	test("takes numbers written as numerals or words as the same instalment", () => {
		const slime = titled({ english: "Slime Season 3" }, 12);
		expect(acceptsTitleMatch(slime, "Slime Season III", 12)).toBe(true);
		expect(acceptsTitleMatch(slime, "Slime Season Three", 12)).toBe(true);
		expect(acceptsTitleMatch(slime, "Slime Season Two", 12)).toBe(false);
	});

	test("takes any length when AniList does not know the count", () => {
		const unknown = titled({ english: "Attack on Titan Season 2" }, null);
		expect(acceptsTitleMatch(unknown, "Attack on Titan Season 2", 300)).toBe(true);
	});
});

const episodes: IContentUnit[] = Array.from({ length: 40 }, (_, index) => ({
	id: `episode-${index + 1}`,
	number: index + 1,
	title: `Episode ${index + 1}`,
}));

/** A provider whose search and episode list are stood in for, to see what `findMedia` does with them. */
function providerFinding(resolution: MappingResolution | null, units: Promise<IContentUnit[]>) {
	const fetched: string[] = [];
	const provider = new SdkStreamProvider(
		{
			fetchContentUnits: (id) => {
				fetched.push(id);
				return units;
			},
			id: "stub",
			resolveStream: async () => {
				throw new Error("The stub streams nothing");
			},
		},
		{
			resolveProviderMediaId: async () => resolution,
		},
		{
			listsLanguages: true,
			locale: "en",
		},
	);
	return {
		fetched,
		provider,
	};
}

const resolved = (method: MappingMethod, matchedTitle: string): MappingResolution => ({
	matchedTitle,
	method,
	providerId: "stub",
	rawMediaId: "abc",
});

describe("SdkStreamProvider.findMedia", () => {
	test("finds nothing when the provider finds nothing", async () => {
		const { provider, fetched } = providerFinding(null, Promise.resolve([]));
		expect(await provider.findMedia(titan)).toBeNull();
		expect(fetched).toEqual([]);
	});

	test("trusts an ID match without fetching its episodes", async () => {
		const { provider, fetched } = providerFinding(
			resolved("provider", "Anything At All"),
			Promise.resolve([]),
		);
		expect(await provider.findMedia(titan)).toEqual({
			episodeOffset: 0,
			matchedTitle: "Anything At All",
			mediaId: "abc",
			method: "provider",
		});
		expect(fetched).toEqual([]);
	});

	test("keeps a title match that fits, checking its episodes under the provider's ID", async () => {
		const { provider, fetched } = providerFinding(
			resolved("fuzzy", "Attack on Titan Season 2"),
			Promise.resolve(episodes.slice(0, 12)),
		);
		expect((await provider.findMedia(titan))?.mediaId).toBe("abc");
		expect(fetched).toEqual(["stub:abc"]);
	});

	test("drops a title match for another season", async () => {
		const { provider } = providerFinding(
			resolved("fuzzy", "Attack on Titan Season 3"),
			Promise.resolve(episodes.slice(0, 12)),
		);
		expect(await provider.findMedia(titan)).toBeNull();
	});

	test("drops a title match whose list runs far past the anime's episodes", async () => {
		const { provider } = providerFinding(
			resolved("fuzzy", "Attack on Titan Season 2"),
			Promise.resolve(episodes),
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
