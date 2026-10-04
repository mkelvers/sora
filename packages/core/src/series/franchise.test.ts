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
				[3, 2],
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

		expect(titlesOf(parts)).toEqual(["Season 1", "Mugen Train Arc", "Mugen Train"]);
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
	});
});
