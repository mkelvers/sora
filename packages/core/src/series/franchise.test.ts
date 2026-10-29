import { describe, expect, test } from "bun:test";

import { franchiseParts } from "./franchise";
import type { FranchiseTitle } from "./franchise";

const title = (
	anilistId: number,
	name: string,
	format: FranchiseTitle["format"],
	startDate: string,
): FranchiseTitle => ({
	anilistId,
	episodeCount: 12,
	format,
	seriesId: `series-${anilistId}`,
	startDate,
	title: name,
});

const titlesOf = (parts: ReturnType<typeof franchiseParts>) => parts.map((part) => part.title);

describe("franchiseParts", () => {
	test("keeps a crossover that the opening title is named after at the start", () => {
		const parts = franchiseParts(
			[
				title(481, "Yu-Gi-Oh!", "TV", "2000-04-18"),
				title(10_015, "Yu-Gi-Oh! Zexal", "TV", "2011-04-11"),
				title(15_489, "Yu-Gi-Oh! Zexal II", "TV", "2012-10-07"),
			],
			[[10_015, 15_489]],
			{
				crossovers: [481],
				currentId: 10_015,
			},
		);
		expect(parts.filter((part) => part.role === "season").map((part) => part.series_id)).toEqual([
			"series-481",
			"series-10015",
			"series-15489",
		]);
	});

	test("does not start a franchise with an older crossover", () => {
		const parts = franchiseParts(
			[
				title(4975, "Chaos;Head", "TV", "2008-10-09"),
				title(9253, "Steins;Gate", "TV", "2011-04-06"),
				title(10_863, "Steins;Gate: Egoistic Poriomania", "OVA", "2012-02-22"),
			],
			[[9253, 10_863]],
			{
				crossovers: [4975],
				currentId: 9253,
			},
		);
		expect(parts.filter((part) => part.role === "season").map((part) => part.series_id)).toEqual([
			"series-9253",
			"series-10863",
		]);
		expect(parts.find((part) => part.series_id === "series-4975")?.role).toBe("extra");
	});

	test("keeps JoJo's older adaptations out of the modern viewing path", () => {
		const parts = franchiseParts(
			[
				title(666, "JoJo's Bizarre Adventure", "OVA", "1993-11-19"),
				title(665, "JoJo's Bizarre Adventure (2000)", "OVA", "2000-05-25"),
				title(14_719, "JoJo's Bizarre Adventure (TV)", "TV", "2012-10-06"),
				title(20_474, "JoJo's Bizarre Adventure: Stardust Crusaders", "TV", "2014-04-05"),
				title(21_778, "Thus Spoke Rohan Kishibe", "OVA", "2017-09-20"),
			],
			[
				[665, 666],
				[14_719, 20_474],
			],
			{
				alternatives: [
					[666, 20_474],
					[665, 20_474],
				],
				currentId: 14_719,
			},
		);
		expect(titlesOf(parts)).toEqual(["Season 1", "Stardust Crusaders", "Thus Spoke Rohan Kishibe"]);
		expect(parts[0]?.next_series_id).toBe("series-20474");
	});

	test("keeps the same main seasons when an alternative adaptation is selected", () => {
		const parts = franchiseParts(
			[
				title(666, "JoJo's Bizarre Adventure", "OVA", "1993-11-19"),
				title(665, "JoJo's Bizarre Adventure (2000)", "OVA", "2000-05-25"),
				title(14_719, "JoJo's Bizarre Adventure (TV)", "TV", "2012-10-06"),
				title(20_474, "JoJo's Bizarre Adventure: Stardust Crusaders", "TV", "2014-04-05"),
			],
			[
				[665, 666],
				[14_719, 20_474],
			],
			{
				alternatives: [
					[666, 20_474],
					[665, 20_474],
				],
				currentId: 665,
			},
		);
		expect(parts.filter((part) => part.role === "season").map((part) => part.series_id)).toEqual([
			"series-14719",
			"series-20474",
		]);
		expect(parts.find((part) => part.series_id === "series-665")?.role).toBe("alternative");
		expect(parts.filter((part) => part.role === "extra")).toEqual([]);
	});

	test("keeps essential sequel films and specials in the picker", () => {
		const parts = franchiseParts(
			[
				title(1, "Show", "TV", "2020-01-01"),
				title(2, "Show: Finale", "SPECIAL", "2021-01-01"),
				title(3, "Show: Movie", "MOVIE", "2022-01-01"),
			],
			[
				[1, 2],
				[2, 3],
			],
		);
		expect(parts.every((part) => part.role === "season")).toBe(true);
		expect(parts[0]?.next_series_id).toBe("series-2");
	});

	test("does not turn an optional OVA prequel into the starting season", () => {
		const parts = franchiseParts(
			[title(2, "Show: Prequel", "OVA", "2015-01-01"), title(1, "Show", "TV", "2020-01-01")],
			[[2, 1]],
		);
		expect(parts.map((part) => part.role)).toEqual(["season", "extra"]);
		expect(parts[1]?.next_series_id).toBeNull();
	});

	test("recommends one version of an arc and excludes recaps", () => {
		const parts = franchiseParts(
			[
				title(1, "Show", "TV", "2020-01-01"),
				title(2, "Show: Movie", "MOVIE", "2021-01-01"),
				title(3, "Show: Arc", "TV", "2022-01-01"),
				title(4, "Show Season 2", "TV", "2023-01-01"),
				title(5, "Show: Recap", "MOVIE", "2024-01-01"),
			],
			[
				[1, 2],
				[1, 3],
				[2, 4],
				[3, 4],
			],
			{ alternatives: [[2, 3]], summaries: [5] },
		);
		expect(titlesOf(parts)).toEqual(["Season 1", "Arc", "Season 2"]);
		expect(parts[0]?.next_series_id).toBe("series-3");
	});

	test("never auto-continues into an ambiguous or unavailable sequel", () => {
		const first = title(1, "Show", "TV", "2020-01-01");
		const second = title(2, "Show Season 2", "TV", "2021-01-01");
		expect(
			franchiseParts(
				[first, second],
				[
					[1, 2],
					[1, 3],
				],
			)[0]?.next_series_id,
		).toBeNull();
		expect(
			franchiseParts([first, { ...second, episodeCount: 0 }], [[1, 2]])[0]?.next_series_id,
		).toBeNull();
		expect(franchiseParts([first, second], [])[0]?.next_series_id).toBeNull();
		expect(
			franchiseParts(
				[first, second],
				[
					[1, 2],
					[2, 1],
				],
			).every((part) => part.next_series_id === null),
		).toBe(true);
	});

	test("keeps the same main seasons when a film alternative is selected", () => {
		const parts = franchiseParts(
			[
				title(1, "Show", "TV", "2020-01-01"),
				title(2, "Show: Movie", "MOVIE", "2021-01-01"),
				title(3, "Show: Arc", "TV", "2022-01-01"),
				title(4, "Show Season 2", "TV", "2023-01-01"),
			],
			[
				[1, 2],
				[1, 3],
				[2, 4],
				[3, 4],
			],
			{ alternatives: [[2, 3]], currentId: 2 },
		);
		expect(titlesOf(parts)).toEqual(["Season 1", "Arc", "Season 2", "Movie"]);
		expect(parts[0]?.next_series_id).toBe("series-3");
		expect(parts[3]?.role).toBe("alternative");
		expect(parts[3]?.next_series_id).toBeNull();
	});
	test("preserves known season and part numbers across translated titles", () => {
		const parts = franchiseParts(
			[
				title(1, "That Time I Got Reincarnated as a Slime", "TV", "2018-01-01"),
				title(2, "Tensei Shitara Slime Datta Ken 4th Season Part 3", "TV", "2027-01-01"),
			],
			[[1, 2]],
		);
		expect(parts[1]?.title).toBe("Season 4 Part 3");
		expect(franchiseParts([title(1, "Show Season 2", "TV", "2020-01-01")], [])[0]?.title).toBe(
			"Season 2",
		);
	});
	test("lists Slime's seasons first, named without the franchise's name", () => {
		const parts = franchiseParts(
			[
				title(
					6,
					"That Time I Got Reincarnated as a Slime the Movie: Tears of the Azure Sea",
					"MOVIE",
					"2026-02-27",
				),
				title(4, "That Time I Got Reincarnated as a Slime Season 3", "TV", "2024-04-05"),
				title(5, "That Time I Got Reincarnated as a Slime OAD", "OVA", "2019-03-29"),
				title(1, "That Time I Got Reincarnated as a Slime", "TV", "2018-10-02"),
				title(7, "That Time I Got Reincarnated as a Slime: Visions of Coleus", "OVA", "2023-11-01"),
				title(2, "That Time I Got Reincarnated as a Slime Season 2", "TV", "2021-01-12"),
				title(3, "That Time I Got Reincarnated as a Slime Season 2 Part 2", "TV", "2021-07-06"),
				title(8, "The Slime Diaries", "TV", "2021-04-06"),
			],
			[
				[1, 2],
				[2, 3],
				[3, 4],
			],
		);

		expect(titlesOf(parts)).toEqual([
			"Season 1",
			"Season 2",
			"Season 2 Part 2",
			"Season 3",
			"OAD",
			"The Slime Diaries",
			"Visions of Coleus",
			"Tears of the Azure Sea",
		]);
		expect(parts.filter((part) => part.role === "season").map((part) => part.title)).toEqual([
			"Season 1",
			"Season 2",
			"Season 2 Part 2",
			"Season 3",
		]);
	});

	test("leaves a spin-off named after the franchise out of its seasons", () => {
		const parts = franchiseParts(
			[
				title(1, "Attack on Titan", "TV", "2013-04-07"),
				title(2, "Attack on Titan: Junior High", "TV", "2015-10-04"),
				title(3, "Attack on Titan Season 2", "TV", "2017-04-01"),
			],
			[[1, 3]],
		);

		expect(titlesOf(parts)).toEqual(["Season 1", "Season 2", "Junior High"]);
		expect(parts.find((part) => part.series_id === "series-2")?.role).toBe("extra");
	});

	test("follows the sequels through a film", () => {
		const parts = franchiseParts(
			[
				title(1, "Demon Slayer: Kimetsu no Yaiba", "TV", "2019-04-06"),
				title(2, "Demon Slayer -Kimetsu no Yaiba- The Movie: Mugen Train", "MOVIE", "2020-10-16"),
				title(3, "Demon Slayer: Kimetsu no Yaiba Mugen Train Arc", "TV", "2021-10-10"),
			],
			[
				[1, 2],
				[2, 3],
			],
		);

		expect(titlesOf(parts)).toEqual(["Season 1", "Mugen Train", "Mugen Train Arc"]);
	});

	test("goes by names when AniList relates no sequels", () => {
		const parts = franchiseParts(
			[
				title(1, "Bleach", "TV", "2004-10-05"),
				title(2, "Bleachers", "TV", "2010-01-01"),
				title(3, "Bleach: Thousand-Year Blood War", "TV", "2022-10-11"),
			],
			[],
		);

		expect(titlesOf(parts)).toEqual(["Season 1", "Thousand-Year Blood War", "Bleachers"]);
	});

	test("drops the marks a title wraps its own name in", () => {
		const parts = franchiseParts(
			[
				title(1, "Attack on Titan", "TV", "2013-04-07"),
				title(2, "Attack on Titan ~Chronicle~", "MOVIE", "2020-07-17"),
			],
			[],
		);

		expect(titlesOf(parts)).toEqual(["Season 1", "Chronicle"]);
	});

	test("names a franchise's first film by its own title", () => {
		const parts = franchiseParts(
			[
				title(1, "Your Name.", "MOVIE", "2016-08-26"),
				title(2, "Your Name. Director's Cut", "MOVIE", "2017-01-01"),
			],
			[],
		);

		expect(titlesOf(parts)).toEqual(["Your Name.", "Director's Cut"]);
		expect(parts.every((part) => part.role === "extra")).toBe(true);
	});

	test("joins an era AniList leaves unlinked after the latest earlier season", () => {
		const parts = franchiseParts(
			[
				title(1, "Pokémon", "TV", "1997-04-01"),
				title(2, "Pokémon: Black & White", "TV", "2010-09-23"),
				title(3, "Pokémon the Series: XY", "TV", "2013-10-17"),
				title(4, "Pokémon the Series: XYZ", "TV", "2015-10-29"),
				title(5, "Pokémon the Movie: I Choose You!", "MOVIE", "2017-07-15"),
			],
			[
				[1, 2],
				[3, 4],
			],
			{
				alternatives: [[1, 5]],
			},
		);
		expect(parts.map((part) => [part.series_id, part.role])).toEqual([
			["series-1", "season"],
			["series-2", "season"],
			["series-3", "season"],
			["series-4", "season"],
		]);
		expect(parts[1]?.next_series_id).toBeNull();
		expect(parts[2]?.next_series_id).toBe("series-4");
	});

	test("does not chain an alternative adaptation as a later season", () => {
		const parts = franchiseParts(
			[
				title(1, "Fullmetal Alchemist", "TV", "2003-10-04"),
				title(2, "Fullmetal Alchemist: Brotherhood", "TV", "2009-04-05"),
				title(3, "Fullmetal Alchemist: The Movie", "MOVIE", "2005-07-23"),
			],
			[[1, 3]],
			{
				alternatives: [[1, 2]],
			},
		);
		expect(parts.find((part) => part.series_id === "series-2")?.role).not.toBe("season");
	});

	test("keeps the story together across a film with nothing to watch", () => {
		const titles = [
			title(1, "Rascal Does Not Dream of Bunny Girl Senpai", "TV", "2018-10-04"),
			title(2, "Rascal Does Not Dream of a Dreaming Girl", "MOVIE", "2019-06-15"),
			title(3, "Rascal Does Not Dream of a Sister Venturing Out", "MOVIE", "2023-06-23"),
			title(4, "Rascal Does Not Dream of a Knapsack Kid", "MOVIE", "2023-12-01"),
			title(5, "Rascal Does Not Dream of Santa Claus", "TV", "2025-07-05"),
		];
		const parts = franchiseParts(
			titles,
			[
				[1, 2],
				[2, 3],
				[3, 4],
				[4, 5],
			],
			{ unlisted: [3, 4] },
		);

		expect(parts.map((part) => [part.title, part.role])).toEqual([
			["Season 1", "season"],
			["Rascal Does Not Dream of a Dreaming Girl", "season"],
			["Rascal Does Not Dream of Santa Claus", "season"],
		]);
		expect(parts[1]?.next_series_id).toBe("series-5");
	});
});
