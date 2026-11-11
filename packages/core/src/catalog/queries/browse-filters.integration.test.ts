import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { inArray } from "drizzle-orm";

import { db } from "../../database/client";
import { animeSearch, animeSearchTag } from "../../database/schema/catalog";
import type { BrowseQuery } from "./browse-query";
import { browseIndex } from "./search";

const base = -Math.floor(Math.random() * 1_000_000_000) - 1000;

/** Fixture entries, by what sets each apart. */
const ids = {
	ecchi: base - 1,
	harem: base - 2,
	isekai: base,
	nudity: base - 3,
	spoiled: base - 4,
	weakIsekai: base - 5,
};

const row = (
	anilistId: number,
	fields: Partial<typeof animeSearch.$inferInsert>,
): typeof animeSearch.$inferInsert => ({
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
});

const tag = (anilistId: number, name: string, rank: number, spoiler = false) => ({
	adult: false,
	anilistId,
	rank,
	spoiler,
	tag: name,
});

const found = async (filters: Omit<BrowseQuery, "search" | "page" | "perPage">) => {
	const rows = await browseIndex(
		{
			sort: "title",
			...filters,
		},
		50,
		inArray(animeSearch.anilistId, Object.values(ids)),
	);
	return rows.map((entry) => entry.anilistId).toSorted((left, right) => right - left);
};

// Opt in against a migrated local database. The fixture entries and their
// tags are removed even when an assertion fails.
describe.skipIf(process.env.SORA_BROWSE_INTEGRATION !== "1")("browse filters", () => {
	beforeAll(async () => {
		await db.insert(animeSearch).values([
			row(ids.isekai, {
				country: "JP",
				episodes: 12,
				format: "TV",
				source: "LIGHT_NOVEL",
				startDate: "2019-04",
				studios: ["MAPPA"],
			}),
			row(ids.ecchi, {
				country: "KR",
				episodes: 24,
				format: "TV",
				genres: ["Ecchi"],
				seasonYear: 2011,
				source: "MANGA",
			}),
			row(ids.harem, {
				episodes: 30,
				format: "TV",
				seasonYear: 2020,
			}),
			row(ids.nudity, {
				format: "TV",
			}),
			row(ids.spoiled, {
				format: "TV",
			}),
			row(ids.weakIsekai, {
				format: "TV",
			}),
		]);
		await db
			.insert(animeSearchTag)
			.values([
				tag(ids.isekai, "Isekai", 90),
				tag(ids.isekai, "Gore", 20),
				tag(ids.harem, "Isekai", 70),
				tag(ids.harem, "Female Harem", 80),
				tag(ids.nudity, "Nudity", 70),
				tag(ids.spoiled, "Isekai", 95, true),
				tag(ids.weakIsekai, "Isekai", 30),
			]);
	});

	afterAll(async () => {
		await db.delete(animeSearch).where(inArray(animeSearch.anilistId, Object.values(ids)));
	});

	test("a tag finds entries it applies to strongly, never as a spoiler", async () => {
		expect(
			await found({
				tags: ["Isekai"],
			}),
		).toEqual([ids.isekai, ids.harem]);
	});

	test("an excluded tag leaves out entries it applies to", async () => {
		expect(
			await found({
				excludedTags: ["Female Harem"],
				tags: ["Isekai"],
			}),
		).toEqual([ids.isekai]);
	});

	test("hiding mature content leaves out ecchi and strong nudity, not a passing mention", async () => {
		const shown = await found({
			hideMature: true,
		});

		expect(shown).toContain(ids.isekai);
		expect(shown).not.toContain(ids.ecchi);
		expect(shown).not.toContain(ids.nudity);
	});

	test("studio, source, and country match the entry's own", async () => {
		expect(
			await found({
				studios: ["MAPPA"],
			}),
		).toEqual([ids.isekai]);
		expect(
			await found({
				sources: ["MANGA"],
			}),
		).toEqual([ids.ecchi]);
		expect(
			await found({
				countries: ["KR"],
			}),
		).toEqual([ids.ecchi]);
	});

	test("years read the start date when there is no season year", async () => {
		expect(
			await found({
				yearFrom: 2010,
				yearTo: 2019,
			}),
		).toEqual([ids.isekai, ids.ecchi]);
	});

	test("episode counts bound both ways", async () => {
		expect(
			await found({
				maxEpisodes: 26,
				minEpisodes: 14,
			}),
		).toEqual([ids.ecchi]);
	});
});
