import { beforeAll, describe, expect, test } from "bun:test";

import type { MediaFormat, MediaRelation } from "../anilist/graphql.generated";
import { db } from "../database/client";
import { animeSearch } from "../database/schema/catalog";
import { series, titleRelation } from "../database/schema/series";
import { FranchiseWalk } from "./franchise-walk";

/**
 * Stored titles with negative AniList IDs, so they never meet the development
 * database's own, and the relations between them. Each test reads the walk
 * from one of them.
 */
const titles: {
	anilistId: number;
	key: string;
	format: MediaFormat;
	startDate: string;
}[] = [
	// A show and its sequel, and a remake of it on another TMDB show, with its own sequel.
	{
		anilistId: -9101,
		format: "TV",
		key: "tv:-91",
		startDate: "1989-04-15",
	},
	{
		anilistId: -9102,
		format: "TV",
		key: "tv:-91",
		startDate: "1989-10-20",
	},
	{
		anilistId: -9103,
		format: "TV",
		key: "tv:-92",
		startDate: "2024-10-06",
	},
	{
		anilistId: -9104,
		format: "TV",
		key: "tv:-92",
		startDate: "2025-10-05",
	},
	// A film retelling the show's story: it stays with the show.
	{
		anilistId: -9105,
		format: "MOVIE",
		key: "movie:-93",
		startDate: "1991-11-02",
	},
	// A show, its sequel, and a spin-off that lists the show back as its parent.
	{
		anilistId: -9201,
		format: "TV",
		key: "tv:-94",
		startDate: "2016-04-03",
	},
	{
		anilistId: -9202,
		format: "TV",
		key: "tv:-94",
		startDate: "2017-04-01",
	},
	{
		anilistId: -9203,
		format: "TV",
		key: "tv:-95",
		startDate: "2025-04-07",
	},
	// A one-off special listing a show as OTHER, which the show lists as PARENT,
	// and a side story of the special.
	{
		anilistId: -9301,
		format: "TV",
		key: "tv:-96",
		startDate: "2020-01-01",
	},
	{
		anilistId: -9302,
		format: "SPECIAL",
		key: "tv:-97",
		startDate: "2021-01-01",
	},
	{
		anilistId: -9303,
		format: "TV",
		key: "tv:-98",
		startDate: "2022-01-01",
	},
];

describe("FranchiseWalk", () => {
	beforeAll(async () => {
		const now = new Date();

		await db.insert(series).values(
			titles.map((title) => ({
				anilistId: title.anilistId,
				id: `walk${title.anilistId}`,
				key: title.key,
				kind: "tv" as const,
				laidOutAt: now,
				startDate: title.startDate,
				title: `Walk ${title.anilistId}`,
			})),
		);

		await db.insert(animeSearch).values(
			titles.map((title) => ({
				anilistId: title.anilistId,
				format: title.format,
				genres: [],
				isAdult: false,
				popularity: 0,
				searchText: `walk ${title.anilistId}`,
				startDate: title.startDate,
				synonyms: [],
				trending: 0,
				updatedAt: now,
			})),
		);

		// How each title lists another: `[from, relation, to]`.
		await db.insert(titleRelation).values(
			(
				[
					[-9101, "SEQUEL", -9102],
					[-9102, "PREQUEL", -9101],
					[-9101, "ALTERNATIVE", -9103],
					[-9103, "ALTERNATIVE", -9101],
					[-9103, "SEQUEL", -9104],
					[-9104, "PREQUEL", -9103],
					[-9105, "ALTERNATIVE", -9101],
					[-9201, "SEQUEL", -9202],
					[-9202, "PREQUEL", -9201],
					[-9201, "SPIN_OFF", -9203],
					[-9203, "PARENT", -9201],
					[-9301, "PARENT", -9302],
					[-9302, "OTHER", -9301],
					[-9302, "SIDE_STORY", -9303],
				] satisfies [number, MediaRelation, number][]
			).map(([from, relation, to], position) => ({
				anilistId: to,
				position,
				relation,
				seriesId: `walk${from}`,
			})),
		);
	});

	test("keeps a remake and its original apart", async () => {
		expect(await new FranchiseWalk(-9104).reach()).toEqual({
			apart: new Set([-9101]),
			crossovers: new Set(),
			ids: [-9103, -9101],
		});

		// The sequel first, then the others by when they started.
		expect(await new FranchiseWalk(-9101).reach()).toEqual({
			apart: new Set([-9103]),
			crossovers: new Set(),
			ids: [-9102, -9105, -9103],
		});
	});

	test("follows a film retelling the show into the show", async () => {
		expect(await new FranchiseWalk(-9105).reach()).toEqual({
			apart: new Set([-9103]),
			crossovers: new Set(),
			ids: [-9101, -9102, -9103],
		});
	});

	test("keeps a spin-off apart however its original is listed back", async () => {
		expect(await new FranchiseWalk(-9203).reach()).toEqual({
			apart: new Set([-9201]),
			crossovers: new Set(),
			ids: [-9201],
		});
	});

	test("does not follow a one-off that lists the show as OTHER", async () => {
		expect(await new FranchiseWalk(-9301).reach()).toEqual({
			apart: new Set(),
			crossovers: new Set(),
			ids: [-9302],
		});
	});
});
