import { beforeAll, describe, expect, test } from "bun:test";

import { inArray } from "drizzle-orm";

import { db } from "../../database/client";
import { animeSearch, animeSearchTag } from "../../database/schema/catalog";
import type { BrowseQuery } from "./browse-query";
import { browseIndex } from "./search";

const base = -Math.floor(Math.random() * 1_000_000_000) - 1000;

/** Fixture entries, by what sets each apart. */
const ids = {
	adapted: base - 6,
	ecchi: base - 1,
	harem: base - 2,
	isekai: base,
	nudity: base - 3,
	spoiled: base - 4,
	weakIsekai: base - 5,
};

/** The fixture entries, found by browsing the search index. */
class Entries {
	readonly #ids: number[];

	constructor(anilistIds: number[]) {
		this.#ids = anilistIds;
	}

	/** The fixture entries `filters` finds, by AniList ID, highest first. */
	async found(filters: Omit<BrowseQuery, "search" | "page" | "perPage">) {
		const rows = await browseIndex(
			{
				sort: "title",
				...filters,
			},
			50,
			inArray(animeSearch.anilistId, this.#ids),
		);

		return rows.map((entry) => entry.anilistId).toSorted((left, right) => right - left);
	}
}

const entries = new Entries(Object.values(ids));

describe("browse filters", () => {
	beforeAll(async () => {
		const rows: [number, Partial<typeof animeSearch.$inferInsert>][] = [
			[
				ids.isekai,
				{
					country: "JP",
					episodes: 12,
					format: "TV",
					source: "LIGHT_NOVEL",
					startDate: "2019-04",
					studios: ["MAPPA"],
				},
			],
			[
				ids.ecchi,
				{
					country: "KR",
					episodes: 24,
					format: "TV",
					genres: ["Ecchi"],
					seasonYear: 2011,
					source: "MANGA",
				},
			],
			[
				ids.harem,
				{
					episodes: 30,
					format: "TV",
					seasonYear: 2020,
				},
			],
			[
				ids.nudity,
				{
					format: "TV",
				},
			],
			[
				ids.spoiled,
				{
					format: "TV",
				},
			],
			[
				ids.weakIsekai,
				{
					format: "TV",
				},
			],
			[
				ids.adapted,
				{
					country: "JP",
					format: "ONA",
					originCountry: "KR",
					originSource: "WEB_NOVEL",
					source: "MANGA",
				},
			],
		];

		await db.insert(animeSearch).values(
			rows.map(([anilistId, fields]): typeof animeSearch.$inferInsert => ({
				anilistId,
				genres: [],
				isAdult: false,
				popularity: 1,
				searchText: "browse filter fixture",
				studios: [],
				synonyms: [],
				trending: 0,
				updatedAt: new Date(),
				...fields,
			})),
		);

		const tags: [number, string, number, boolean?][] = [
			[ids.isekai, "Isekai", 90],
			[ids.isekai, "Gore", 20],
			[ids.harem, "Isekai", 70],
			[ids.harem, "Female Harem", 80],
			[ids.nudity, "Nudity", 70],
			[ids.spoiled, "Isekai", 95, true],
			[ids.weakIsekai, "Isekai", 30],
		];

		await db.insert(animeSearchTag).values(
			tags.map(([anilistId, name, rank, spoiler = false]) => ({
				adult: false,
				anilistId,
				rank,
				spoiler,
				tag: name,
			})),
		);
	});

	test("a tag finds entries it applies to strongly, never as a spoiler", async () => {
		expect(
			await entries.found({
				tags: ["Isekai"],
			}),
		).toEqual([ids.isekai, ids.harem]);
	});

	test("an excluded tag leaves out entries it applies to", async () => {
		expect(
			await entries.found({
				excludedTags: ["Female Harem"],
				tags: ["Isekai"],
			}),
		).toEqual([ids.isekai]);
	});

	test("hiding mature content leaves out ecchi and strong nudity, not a passing mention", async () => {
		const shown = await entries.found({
			hideMature: true,
		});

		expect(shown).toContain(ids.isekai);
		expect(shown).not.toContain(ids.ecchi);
		expect(shown).not.toContain(ids.nudity);
	});

	test("studio, source, and country match the entry's own", async () => {
		expect(
			await entries.found({
				studios: ["MAPPA"],
			}),
		).toEqual([ids.isekai]);
		expect(
			await entries.found({
				sources: ["LIGHT_NOVEL"],
			}),
		).toEqual([ids.isekai]);
		expect(
			await entries.found({
				countries: ["JP"],
			}),
		).toEqual([ids.isekai, ids.adapted]);
	});

	test("country and source also match where the story comes from", async () => {
		expect(
			await entries.found({
				countries: ["KR"],
				sources: ["WEB_NOVEL"],
			}),
		).toEqual([ids.adapted]);
		expect(
			await entries.found({
				sources: ["MANGA"],
			}),
		).toEqual([ids.ecchi, ids.adapted]);
	});

	test("years read the start date when there is no season year", async () => {
		expect(
			await entries.found({
				yearFrom: 2010,
				yearTo: 2019,
			}),
		).toEqual([ids.isekai, ids.ecchi]);
	});

	test("episode counts bound both ways", async () => {
		expect(
			await entries.found({
				maxEpisodes: 26,
				minEpisodes: 14,
			}),
		).toEqual([ids.ecchi]);
	});
});
