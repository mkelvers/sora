import { describe, expect, test } from "bun:test";

import { franchiseParts, type FranchiseTitle } from "./franchise";

function title(
	anilistId: number,
	name: string,
	format: FranchiseTitle["format"],
	startDate: string,
): FranchiseTitle {
	return {
		seriesId: `series-${anilistId}`,
		anilistId,
		title: name,
		format,
		startDate,
		episodeCount: 12,
	};
}

function titlesOf(parts: ReturnType<typeof franchiseParts>) {
	return parts.map((part) => part.title);
}

describe("franchiseParts", () => {
	test("keeps JoJo's older adaptations out of the modern viewing path", () => {
		const parts = franchiseParts(
			[
				title(666, "JoJo's Bizarre Adventure", "OVA", "1993-11-19"),
				title(665, "JoJo's Bizarre Adventure (2000)", "OVA", "2000-05-25"),
				title(14719, "JoJo's Bizarre Adventure (TV)", "TV", "2012-10-06"),
				title(20474, "JoJo's Bizarre Adventure: Stardust Crusaders", "TV", "2014-04-05"),
				title(21778, "Thus Spoke Rohan Kishibe", "OVA", "2017-09-20"),
			],
			[
				[665, 666],
				[14719, 20474],
			],
			{
				alternatives: [
					[666, 20474],
					[665, 20474],
				],
				currentId: 14719,
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
				title(14719, "JoJo's Bizarre Adventure (TV)", "TV", "2012-10-06"),
				title(20474, "JoJo's Bizarre Adventure: Stardust Crusaders", "TV", "2014-04-05"),
			],
			[
				[665, 666],
				[14719, 20474],
			],
			{
				alternatives: [
					[666, 20474],
					[665, 20474],
				],
				currentId: 665,
			},
		);
		expect(parts.filter((part) => part.role === "season").map((part) => part.series_id)).toEqual([
			"series-14719",
			"series-20474",
		]);
		expect(parts.find((part) => part.series_id === "series-665")?.role).toBe("alternative");
		expect(parts.filter((part) => part.role === "related")).toEqual([]);
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
		expect(parts.map((part) => part.role)).toEqual(["season", "related"]);
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
		expect(parts.find((part) => part.series_id === "series-2")?.role).toBe("related");
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
		expect(parts.every((part) => part.role === "related")).toBe(true);
	});
});
