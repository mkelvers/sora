import { beforeEach, describe, expect, test } from "bun:test";

import { anime } from "../../catalog/models/anime.fixture";
import {
	fillerOf,
	findAnimeLanguages,
	findListings,
	watchable,
	languagesOf,
	offered,
} from "./versions";
import type { VersionDependencies } from "./versions";
import { listed, listedAs, notLookedUp, provider, unit } from "./versions.fixture";
import type { FakeProvider } from "./versions.fixture";

/** What the fakes were asked: lookups queued, their priorities, and requests to AniKoto. */
interface FakeRequests {
	asks: number;
	queuedLookups: number[];
	queuedPriorities: string[];
}

const fake: FakeRequests = {
	asks: 0,
	queuedLookups: [],
	queuedPriorities: [],
};

/** Fake providers, and dependencies backed by them that record what they are asked. */
class Providers {
	readonly dependencies: VersionDependencies;

	constructor(list: FakeProvider[]) {
		this.dependencies = {
			getAnime: (id) => Promise.resolve(anime(id)),
			getProviderUnits: (_anime, target) => {
				fake.asks += 1;

				return list.find((candidate) => candidate.id === target.id)?.ask() ?? Promise.resolve([]);
			},
			getStoredLanguages: (anilistIds, providers) =>
				Promise.resolve(
					[...new Set(anilistIds)].flatMap((anilistId) =>
						list.flatMap((candidate) => {
							const units = candidate.units(anilistId);

							if (units && providers.includes(candidate.id)) {
								return [
									{
										anilistId,
										languages: (["dub", "sub", "raw"] as const).filter((language) =>
											units.some((entry) => entry.languages?.includes(language)),
										),
										provider: candidate.id,
									},
								];
							}

							return [];
						}),
					),
				),
			getStoredUnits: (anilistIds) =>
				Promise.resolve(
					[...new Set(anilistIds)].flatMap((anilistId) =>
						list.flatMap((candidate) => {
							const units = candidate.units(anilistId);

							if (units) {
								return [
									{
										anilistId,
										provider: candidate.id,
										units,
									},
								];
							}

							return [];
						}),
					),
				),
			providers: list.map(({ id, locale, listsLanguages }) => ({
				findMedia: () => Promise.resolve(null),
				id,
				listEpisodes: () => Promise.resolve([]),
				listsLanguages,
				locale,
				resolveStream: () => Promise.reject(new Error(`${id} streams nothing in these tests`)),
			})),
			scheduleEpisodeLookups: (anilistIds, priority) => {
				fake.queuedLookups.push(...anilistIds);

				if (anilistIds.length > 0) {
					fake.queuedPriorities.push(priority);
				}

				return Promise.resolve();
			},
		};
	}

	/** {@link findListings} with only each episode's languages, for tests about those. */
	async languages(episodes: Parameters<typeof findListings>[0]) {
		const found = await findListings(episodes, this.dependencies);

		return new Map([...found].map(([key, listing]) => [key, listing.languages]));
	}
}

const pilot = [
	{
		anilistId: 1,
		episode: 1,
	},
];

beforeEach(() => {
	fake.queuedLookups = [];
	fake.queuedPriorities = [];
	fake.asks = 0;
});

describe("offered", () => {
	test("offers each language a provider lists, in the provider's locale", () => {
		expect(offered([listed("en", ["sub", "dub"])])).toEqual([
			{
				language: "dub",
				locale: "en",
			},
			{
				language: "sub",
				locale: "en",
			},
		]);
	});

	test("gives raw no locale, since it has neither dubbed audio nor subtitles", () => {
		expect(offered([listed("en", ["raw"])])).toEqual([
			{
				language: "raw",
				locale: null,
			},
		]);
	});

	test("merges providers, keeping one entry per language and locale", () => {
		expect(
			offered([
				listed("en", ["sub"]),
				listed("pt-BR", ["dub", "sub"]),
				listed("en", ["sub", "dub", "raw"]),
				listed("pt-BR", ["raw"]),
			]),
		).toEqual([
			{
				language: "dub",
				locale: "en",
			},
			{
				language: "dub",
				locale: "pt-BR",
			},
			{
				language: "sub",
				locale: "en",
			},
			{
				language: "sub",
				locale: "pt-BR",
			},
			{
				language: "raw",
				locale: null,
			},
		]);
	});

	test("ignores providers whose lists claim every language", () => {
		expect(offered([listed("en", ["sub", "dub"], false)])).toEqual([]);
	});

	test("ignores a unit that does not say which languages it has", () => {
		expect(offered([listed("en", null)])).toEqual([]);
	});
});

describe("languagesOf", () => {
	test("drops locales and keeps each language once, in order", () => {
		expect(
			languagesOf([
				{
					language: "sub",
					locale: "en",
				},
				{
					language: "sub",
					locale: "pt-BR",
				},
				{
					language: "dub",
					locale: "pt-BR",
				},
			]),
		).toEqual(["sub", "dub"]);
	});
});

describe("fillerOf", () => {
	test("calls an episode filler when any provider does", () => {
		expect(fillerOf([listedAs(false), listedAs(true)])).toBe(true);
	});

	test("calls an episode not filler when every provider that says agrees", () => {
		expect(fillerOf([listedAs(null), listedAs(false)])).toBe(false);
	});

	test("does not know when no provider says", () => {
		expect(fillerOf([listedAs(null)])).toBeNull();
		expect(fillerOf([])).toBeNull();
	});
});

describe("watchable", () => {
	test("combines the English providers that list the AniList episode", async () => {
		const { dependencies } = new Providers([
			provider("anikoto", "en", [unit(3, ["sub", "dub"])]),
			provider("megaplay", "en", [unit(3, ["sub", "dub"])], false),
			provider("allmanga", "en", [unit(3, ["sub", "raw"]), unit(4, ["dub"])]),
			provider("brazilian", "pt-BR", [unit(3, ["dub"])]),
		]);

		expect(
			await watchable(
				{
					anilistId: 154_587,
					number: 3,
				},
				dependencies,
			),
		).toEqual([
			{
				language: "dub",
				locale: "en",
			},
			{
				language: "sub",
				locale: "en",
			},
			{
				language: "raw",
				locale: null,
			},
		]);
		expect(fake.queuedLookups).toEqual([]);
	});

	test("lists what is stored and queues the lookup when a provider is not looked up yet", async () => {
		const { dependencies } = new Providers([
			provider("anikoto", "en", [unit(3, ["sub"])]),
			notLookedUp("allmanga", "en"),
		]);

		expect(
			await watchable(
				{
					anilistId: 154_587,
					number: 3,
				},
				dependencies,
			),
		).toEqual([
			{
				language: "sub",
				locale: "en",
			},
		]);
		expect(fake.queuedLookups).toEqual([154_587]);
		expect(fake.queuedPriorities).toEqual(["waiting"]);
	});

	test("looks an anime no provider was looked up for up on the spot", async () => {
		const { dependencies } = new Providers([
			notLookedUp("anikoto", "en", [unit(3, ["sub"])]),
			notLookedUp("allmanga", "en", [unit(3, ["dub"])]),
		]);

		expect(
			await watchable(
				{
					anilistId: 154_587,
					number: 3,
				},
				dependencies,
			),
		).toEqual([
			{
				language: "dub",
				locale: "en",
			},
			{
				language: "sub",
				locale: "en",
			},
		]);
		expect(fake.asks).toBe(2);
		expect(fake.queuedLookups).toEqual([]);
	});

	test("leaves providers that fail the first lookup to the scheduler", async () => {
		const { dependencies } = new Providers([
			notLookedUp("anikoto", "en", [unit(3, ["sub"])]),
			notLookedUp("allmanga", "en"),
		]);

		expect(
			await watchable(
				{
					anilistId: 154_587,
					number: 3,
				},
				dependencies,
			),
		).toEqual([
			{
				language: "sub",
				locale: "en",
			},
		]);
		expect(fake.queuedLookups).toEqual([154_587]);
	});

	test("shares one first lookup between concurrent plays", async () => {
		const { dependencies } = new Providers([notLookedUp("anikoto", "en", [unit(3, ["sub"])])]);

		const episode = {
			anilistId: 154_587,
			number: 3,
		};

		await Promise.all([watchable(episode, dependencies), watchable(episode, dependencies)]);

		expect(fake.asks).toBe(1);
	});

	test("returns nothing when no provider lists the episode", async () => {
		const { dependencies } = new Providers([provider("anikoto", "en", [unit(1, ["sub", "dub"])])]);

		expect(
			await watchable(
				{
					anilistId: 154_587,
					number: 3,
				},
				dependencies,
			),
		).toEqual([]);
	});
});

describe("findListings", () => {
	test("marks each episode filler or not, as the providers that say do", async () => {
		const { dependencies } = new Providers([
			provider("anikoto", "en", [unit(1, ["sub"], false), unit(2, ["sub"], true)]),
			provider("silent", "en", [unit(1, ["dub"]), unit(2, ["dub"]), unit(3, ["dub"])]),
		]);

		const found = await findListings(
			[1, 2, 3].map((episode) => ({
				anilistId: 1,
				episode,
			})),
			dependencies,
		);

		expect(Object.fromEntries([...found].map(([key, listing]) => [key, listing.isFiller]))).toEqual(
			{
				"1:1": false,
				"1:2": true,
				"1:3": null,
			},
		);
	});

	test("does not know whether an episode is filler while it is unknown", async () => {
		const { dependencies } = new Providers([notLookedUp("anikoto", "en")]);

		const listings = await findListings(pilot, dependencies);
		expect(listings.get("1:1")).toEqual({
			isFiller: null,
			languages: null,
		});
	});
});

describe("findEpisodeLanguages", () => {
	test("lists each episode's languages, keyed by AniList episode", async () => {
		const providers = new Providers([
			provider("anikoto", "en", [unit(1, ["sub", "dub"]), unit(2, ["sub"])]),
			provider("brazilian", "pt-BR", [unit(2, ["dub"])]),
		]);

		const found = await providers.languages(
			[1, 2, 3].map((episode) => ({
				anilistId: 1,
				episode,
			})),
		);

		expect(Object.fromEntries(found)).toEqual({
			"1:1": ["dub", "sub"],
			// The Brazilian dub is not English.
			"1:2": ["sub"],
			"1:3": [],
		});
	});

	test("marks an anime's episodes unknown until it is looked up, queueing its lookup, and keeps others", async () => {
		const providers = new Providers([
			{
				...provider("anikoto", "en", []),
				ask: () => Promise.reject(new Error("AniKoto is down")),
				units: (anilistId) => {
					if (anilistId !== 1) {
						return null;
					}

					return [unit(1, ["sub", "dub"])];
				},
			},
		]);

		const found = await providers.languages([
			{
				anilistId: 1,
				episode: 1,
			},
			{
				anilistId: 2,
				episode: 1,
			},
		]);

		expect(Object.fromEntries(found)).toEqual({
			"1:1": ["dub", "sub"],
			"2:1": null,
		});
		expect(fake.queuedLookups).toEqual([2]);
		expect(fake.queuedPriorities).toEqual(["waiting"]);
	});

	test("asks no provider for an anime none was looked up for, and queues its lookup", async () => {
		const providers = new Providers([
			notLookedUp("anikoto", "en", [unit(1, ["sub"])]),
			notLookedUp("allmanga", "en", [unit(1, ["dub"])]),
		]);

		const languages = await providers.languages(pilot);
		expect(languages.get("1:1")).toBeNull();
		expect(fake.asks).toBe(0);
		expect(fake.queuedLookups).toEqual([1]);
	});

	test("asks no provider once any has been looked up", async () => {
		const providers = new Providers([
			provider("anikoto", "en", [unit(1, ["sub"])]),
			notLookedUp("allmanga", "en", [unit(1, ["dub"])]),
		]);

		const languages = await providers.languages(pilot);
		expect(languages.get("1:1")).toEqual(["sub"]);
		expect(fake.asks).toBe(0);
		expect(fake.queuedLookups).toEqual([1]);
	});

	test("uses the providers looked up so far when another has not been", async () => {
		const providers = new Providers([
			provider("anikoto", "en", [unit(1, ["sub"])]),
			notLookedUp("slow", "en"),
		]);

		const languages = await providers.languages(pilot);
		expect(languages.get("1:1")).toEqual(["sub"]);
	});

	test("marks an episode unknown, not unwatchable, when only a provider not looked up yet might list it", async () => {
		const providers = new Providers([provider("anikoto", "en", []), notLookedUp("slow", "en")]);

		const languages = await providers.languages(pilot);
		expect(languages.get("1:1")).toBeNull();
	});

	test("knows an episode is unwatchable once every provider is looked up without listing it", async () => {
		const providers = new Providers([
			provider("anikoto", "en", []),
			provider("allmanga", "en", []),
		]);

		const languages = await providers.languages(pilot);
		expect(languages.get("1:1")).toEqual([]);
		expect(fake.queuedLookups).toEqual([]);
	});

	test("ignores providers whose lists do not say which languages episodes have", async () => {
		const providers = new Providers([
			provider("anikoto", "en", [unit(1, ["sub"])]),
			{
				...notLookedUp("megaplay", "en"),
				listsLanguages: false,
			},
		]);

		const languages = await providers.languages(pilot);
		expect(languages.get("1:1")).toEqual(["sub"]);
		expect(fake.queuedLookups).toEqual([]);
	});
});

describe("findAnimeLanguages", () => {
	test("lists the languages of the providers looked up so far, and queues the rest", async () => {
		const { dependencies } = new Providers([
			{
				...provider("anikoto", "en", []),
				units: (anilistId) => {
					if (anilistId !== 1) {
						return null;
					}

					return [unit(1, ["sub", "dub"])];
				},
			},
			provider("allmanga", "en", [unit(1, ["sub"])]),
		]);

		expect(Object.fromEntries(await findAnimeLanguages([1, 2], dependencies))).toEqual({
			1: ["dub", "sub"],
			2: ["sub"],
		});
		expect(fake.asks).toBe(0);
		expect(fake.queuedLookups).toEqual([2]);
		expect(fake.queuedPriorities).toEqual(["current"]);
	});
});
