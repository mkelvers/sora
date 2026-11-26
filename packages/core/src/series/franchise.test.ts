import { describe, expect, test } from "bun:test";

import { Franchise } from "./franchise";
import type { FranchiseTitle } from "./franchise";

/** A title of a franchise of 12 episodes, its series named after its AniList ID. */
class Fixture {
	readonly #anilistId: number;
	readonly #name: string;
	readonly #format: FranchiseTitle["format"];
	readonly #startDate: string;

	constructor(
		anilistId: number,
		name: string,
		format: FranchiseTitle["format"],
		startDate: string,
	) {
		this.#anilistId = anilistId;
		this.#name = name;
		this.#format = format;
		this.#startDate = startDate;
	}

	get title(): FranchiseTitle {
		return {
			anilistId: this.#anilistId,
			episodeCount: 12,
			format: this.#format,
			seriesId: `series-${this.#anilistId}`,
			startDate: this.#startDate,
			title: this.#name,
		};
	}
}

describe("Franchise", () => {
	test("keeps a crossover that the opening title is named after at the start", () => {
		const { parts } = new Franchise(
			[
				new Fixture(481, "Yu-Gi-Oh!", "TV", "2000-04-18").title,
				new Fixture(10_015, "Yu-Gi-Oh! Zexal", "TV", "2011-04-11").title,
				new Fixture(15_489, "Yu-Gi-Oh! Zexal II", "TV", "2012-10-07").title,
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
		const { parts } = new Franchise(
			[
				new Fixture(4975, "Chaos;Head", "TV", "2008-10-09").title,
				new Fixture(9253, "Steins;Gate", "TV", "2011-04-06").title,
				new Fixture(10_863, "Steins;Gate: Egoistic Poriomania", "OVA", "2012-02-22").title,
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
		const { parts } = new Franchise(
			[
				new Fixture(666, "JoJo's Bizarre Adventure", "OVA", "1993-11-19").title,
				new Fixture(665, "JoJo's Bizarre Adventure (2000)", "OVA", "2000-05-25").title,
				new Fixture(14_719, "JoJo's Bizarre Adventure (TV)", "TV", "2012-10-06").title,
				new Fixture(20_474, "JoJo's Bizarre Adventure: Stardust Crusaders", "TV", "2014-04-05")
					.title,
				new Fixture(21_778, "Thus Spoke Rohan Kishibe", "OVA", "2017-09-20").title,
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

		expect(parts.map((part) => part.title)).toEqual([
			"Season 1",
			"Stardust Crusaders",
			"Thus Spoke Rohan Kishibe",
		]);
		expect(parts[0]?.next_series_id).toBe("series-20474");
	});

	test("keeps the same main seasons when an alternative adaptation is selected", () => {
		const { parts } = new Franchise(
			[
				new Fixture(666, "JoJo's Bizarre Adventure", "OVA", "1993-11-19").title,
				new Fixture(665, "JoJo's Bizarre Adventure (2000)", "OVA", "2000-05-25").title,
				new Fixture(14_719, "JoJo's Bizarre Adventure (TV)", "TV", "2012-10-06").title,
				new Fixture(20_474, "JoJo's Bizarre Adventure: Stardust Crusaders", "TV", "2014-04-05")
					.title,
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
		const { parts } = new Franchise(
			[
				new Fixture(1, "Show", "TV", "2020-01-01").title,
				new Fixture(2, "Show: Finale", "SPECIAL", "2021-01-01").title,
				new Fixture(3, "Show: Movie", "MOVIE", "2022-01-01").title,
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
		const { parts } = new Franchise(
			[
				new Fixture(2, "Show: Prequel", "OVA", "2015-01-01").title,
				new Fixture(1, "Show", "TV", "2020-01-01").title,
			],
			[[2, 1]],
		);

		expect(parts.map((part) => part.role)).toEqual(["season", "extra"]);
		expect(parts[1]?.next_series_id).toBeNull();
	});

	test("recommends one version of an arc and excludes recaps", () => {
		const { parts } = new Franchise(
			[
				new Fixture(1, "Show", "TV", "2020-01-01").title,
				new Fixture(2, "Show: Movie", "MOVIE", "2021-01-01").title,
				new Fixture(3, "Show: Arc", "TV", "2022-01-01").title,
				new Fixture(4, "Show Season 2", "TV", "2023-01-01").title,
				new Fixture(5, "Show: Recap", "MOVIE", "2024-01-01").title,
			],
			[
				[1, 2],
				[1, 3],
				[2, 4],
				[3, 4],
			],
			{
				alternatives: [[2, 3]],
				summaries: [5],
			},
		);

		expect(parts.map((part) => part.title)).toEqual(["Season 1", "Arc", "Season 2"]);
		expect(parts[0]?.next_series_id).toBe("series-3");
	});

	test("never auto-continues into an ambiguous or unavailable sequel", () => {
		const first = new Fixture(1, "Show", "TV", "2020-01-01").title;
		const second = new Fixture(2, "Show Season 2", "TV", "2021-01-01").title;
		expect(
			new Franchise(
				[first, second],
				[
					[1, 2],
					[1, 3],
				],
			).parts[0]?.next_series_id,
		).toBeNull();
		expect(
			new Franchise(
				[
					first,
					{
						...second,
						episodeCount: 0,
					},
				],
				[[1, 2]],
			).parts[0]?.next_series_id,
		).toBeNull();
		expect(new Franchise([first, second], []).parts[0]?.next_series_id).toBeNull();
		expect(
			new Franchise(
				[first, second],
				[
					[1, 2],
					[2, 1],
				],
			).parts.every((part) => part.next_series_id === null),
		).toBe(true);
	});

	test("keeps the same main seasons when a film alternative is selected", () => {
		const { parts } = new Franchise(
			[
				new Fixture(1, "Show", "TV", "2020-01-01").title,
				new Fixture(2, "Show: Movie", "MOVIE", "2021-01-01").title,
				new Fixture(3, "Show: Arc", "TV", "2022-01-01").title,
				new Fixture(4, "Show Season 2", "TV", "2023-01-01").title,
			],
			[
				[1, 2],
				[1, 3],
				[2, 4],
				[3, 4],
			],
			{
				alternatives: [[2, 3]],
				currentId: 2,
			},
		);

		expect(parts.map((part) => part.title)).toEqual(["Season 1", "Arc", "Season 2", "Movie"]);
		expect(parts[0]?.next_series_id).toBe("series-3");
		expect(parts[3]?.role).toBe("alternative");
		expect(parts[3]?.next_series_id).toBeNull();
	});
	test("preserves known season and part numbers across translated titles", () => {
		const { parts } = new Franchise(
			[
				new Fixture(1, "That Time I Got Reincarnated as a Slime", "TV", "2018-01-01").title,
				new Fixture(2, "Tensei Shitara Slime Datta Ken 4th Season Part 3", "TV", "2027-01-01")
					.title,
			],
			[[1, 2]],
		);

		expect(parts[1]?.title).toBe("Season 4 Part 3");
		expect(
			new Franchise([new Fixture(1, "Show Season 2", "TV", "2020-01-01").title], []).parts[0]
				?.title,
		).toBe("Season 2");
	});
	test("lists Slime's seasons first, named without the franchise's name", () => {
		const { parts } = new Franchise(
			[
				new Fixture(
					6,
					"That Time I Got Reincarnated as a Slime the Movie: Tears of the Azure Sea",
					"MOVIE",
					"2026-02-27",
				).title,
				new Fixture(4, "That Time I Got Reincarnated as a Slime Season 3", "TV", "2024-04-05")
					.title,
				new Fixture(5, "That Time I Got Reincarnated as a Slime OAD", "OVA", "2019-03-29").title,
				new Fixture(1, "That Time I Got Reincarnated as a Slime", "TV", "2018-10-02").title,
				new Fixture(
					7,
					"That Time I Got Reincarnated as a Slime: Visions of Coleus",
					"OVA",
					"2023-11-01",
				).title,
				new Fixture(2, "That Time I Got Reincarnated as a Slime Season 2", "TV", "2021-01-12")
					.title,
				new Fixture(
					3,
					"That Time I Got Reincarnated as a Slime Season 2 Part 2",
					"TV",
					"2021-07-06",
				).title,
				new Fixture(8, "The Slime Diaries", "TV", "2021-04-06").title,
			],
			[
				[1, 2],
				[2, 3],
				[3, 4],
			],
		);

		expect(parts.map((part) => part.title)).toEqual([
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
		const { parts } = new Franchise(
			[
				new Fixture(1, "Attack on Titan", "TV", "2013-04-07").title,
				new Fixture(2, "Attack on Titan: Junior High", "TV", "2015-10-04").title,
				new Fixture(3, "Attack on Titan Season 2", "TV", "2017-04-01").title,
			],
			[[1, 3]],
		);

		expect(parts.map((part) => part.title)).toEqual(["Season 1", "Season 2", "Junior High"]);
		expect(parts.find((part) => part.series_id === "series-2")?.role).toBe("extra");
	});

	test("follows the sequels through a film", () => {
		const { parts } = new Franchise(
			[
				new Fixture(1, "Demon Slayer: Kimetsu no Yaiba", "TV", "2019-04-06").title,
				new Fixture(
					2,
					"Demon Slayer -Kimetsu no Yaiba- The Movie: Mugen Train",
					"MOVIE",
					"2020-10-16",
				).title,
				new Fixture(3, "Demon Slayer: Kimetsu no Yaiba Mugen Train Arc", "TV", "2021-10-10").title,
			],
			[
				[1, 2],
				[2, 3],
			],
		);

		expect(parts.map((part) => part.title)).toEqual(["Season 1", "Mugen Train", "Mugen Train Arc"]);
	});

	test("goes by names when AniList relates no sequels", () => {
		const { parts } = new Franchise(
			[
				new Fixture(1, "Bleach", "TV", "2004-10-05").title,
				new Fixture(2, "Bleachers", "TV", "2010-01-01").title,
				new Fixture(3, "Bleach: Thousand-Year Blood War", "TV", "2022-10-11").title,
			],
			[],
		);

		expect(parts.map((part) => part.title)).toEqual([
			"Season 1",
			"Thousand-Year Blood War",
			"Bleachers",
		]);
	});

	test("drops the marks a title wraps its own name in", () => {
		const { parts } = new Franchise(
			[
				new Fixture(1, "Attack on Titan", "TV", "2013-04-07").title,
				new Fixture(2, "Attack on Titan ~Chronicle~", "MOVIE", "2020-07-17").title,
			],
			[],
		);

		expect(parts.map((part) => part.title)).toEqual(["Season 1", "Chronicle"]);
	});

	test("names a franchise's first film by its own title", () => {
		const { parts } = new Franchise(
			[
				new Fixture(1, "Your Name.", "MOVIE", "2016-08-26").title,
				new Fixture(2, "Your Name. Director's Cut", "MOVIE", "2017-01-01").title,
			],
			[],
		);

		expect(parts.map((part) => part.title)).toEqual(["Your Name.", "Director's Cut"]);
		expect(parts.every((part) => part.role === "extra")).toBe(true);
	});

	test("joins an era AniList leaves unlinked after the latest earlier season", () => {
		const { parts } = new Franchise(
			[
				new Fixture(1, "Pokémon", "TV", "1997-04-01").title,
				new Fixture(2, "Pokémon: Black & White", "TV", "2010-09-23").title,
				new Fixture(3, "Pokémon the Series: XY", "TV", "2013-10-17").title,
				new Fixture(4, "Pokémon the Series: XYZ", "TV", "2015-10-29").title,
				new Fixture(5, "Pokémon the Movie: I Choose You!", "MOVIE", "2017-07-15").title,
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
		const { parts } = new Franchise(
			[
				new Fixture(1, "Fullmetal Alchemist", "TV", "2003-10-04").title,
				new Fixture(2, "Fullmetal Alchemist: Brotherhood", "TV", "2009-04-05").title,
				new Fixture(3, "Fullmetal Alchemist: The Movie", "MOVIE", "2005-07-23").title,
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
			new Fixture(1, "Rascal Does Not Dream of Bunny Girl Senpai", "TV", "2018-10-04").title,
			new Fixture(2, "Rascal Does Not Dream of a Dreaming Girl", "MOVIE", "2019-06-15").title,
			new Fixture(3, "Rascal Does Not Dream of a Sister Venturing Out", "MOVIE", "2023-06-23")
				.title,
			new Fixture(4, "Rascal Does Not Dream of a Knapsack Kid", "MOVIE", "2023-12-01").title,
			new Fixture(5, "Rascal Does Not Dream of Santa Claus", "TV", "2025-07-05").title,
		];

		const { parts } = new Franchise(
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

	test("keeps a spin-off and its sequels a story of their own", () => {
		const titles = [
			new Fixture(21_459, "My Hero Academia", "TV", "2016-04-03").title,
			new Fixture(163_139, "My Hero Academia Season 7", "TV", "2024-05-04").title,
			new Fixture(185_736, "My Hero Academia: Vigilantes", "TV", "2025-04-07").title,
			new Fixture(182_896, "My Hero Academia FINAL SEASON", "TV", "2025-10-04").title,
			new Fixture(195_322, "My Hero Academia: Vigilantes Season 2", "TV", "2026-01-05").title,
		];

		const sequels = [
			[21_459, 163_139],
			[163_139, 182_896],
			[185_736, 195_322],
		] as const;

		const spinOffs = [[21_459, 185_736]] as const;

		const original = new Franchise(titles, sequels, {
			currentId: 21_459,
			spinOffs,
		}).parts;

		expect(original.map((part) => [part.title, part.role])).toEqual([
			["Season 1", "season"],
			["Season 7", "season"],
			["FINAL SEASON", "season"],
			["Vigilantes", "extra"],
			["Vigilantes Season 2", "extra"],
		]);

		const spinOff = new Franchise(titles, sequels, {
			apart: [21_459],
			currentId: 195_322,
			spinOffs,
		}).parts;

		expect(spinOff.filter((part) => part.role === "season").map((part) => part.title)).toEqual([
			"Season 1",
			"Season 2",
		]);
	});

	test("lists a remake's own seasons and links each version to the other", () => {
		const titles = [
			new Fixture(210, "Ranma ½", "TV", "1989-04-15").title,
			new Fixture(149_939, "Ranma ½ (1989)", "TV", "1989-10-20").title,
			new Fixture(178_533, "Ranma1/2 (2024)", "TV", "2024-10-06").title,
			new Fixture(185_731, "Ranma1/2 (2024) Season 2", "TV", "2025-10-05").title,
			new Fixture(209_872, "Ranma1/2 (2024) Season 3", "TV", "2026-10-04").title,
		];

		const sequels = [
			[210, 149_939],
			[178_533, 185_731],
			[185_731, 209_872],
		] as const;

		const alternatives = [
			[210, 178_533],
			[149_939, 178_533],
			[149_939, 185_731],
			[209_872, 149_939],
		] as const;

		const remake = new Franchise(titles, sequels, {
			alternatives,
			apart: [210, 149_939],
			currentId: 209_872,
		}).parts;

		expect(remake.map((part) => [part.series_id, part.role])).toEqual([
			["series-178533", "season"],
			["series-185731", "season"],
			["series-209872", "season"],
			["series-210", "alternative"],
		]);

		const original = new Franchise(titles, sequels, {
			alternatives,
			apart: [178_533, 185_731, 209_872],
			currentId: 210,
		}).parts;

		expect(original.map((part) => [part.series_id, part.role])).toEqual([
			["series-210", "season"],
			["series-149939", "season"],
			["series-178533", "alternative"],
		]);
	});

	test("never starts a franchise with a title reached only across a spin-off", () => {
		const { parts } = new Franchise(
			[
				new Fixture(110_857, "Aggretsuko: Season 3", "ONA", "2020-08-27").title,
				new Fixture(124_960, "OTMGirls no YOKIYOKI Channel", "ONA", "2020-12-01").title,
				new Fixture(
					156_907,
					"OTMGirls no YOKIYOKI Channel: Birthday special story",
					"ONA",
					"2021-10-29",
				).title,
			],
			[],
			{
				apart: [110_857],
				currentId: 156_907,
			},
		);

		expect(parts.find((part) => part.role === "season")?.series_id).toBe("series-124960");
	});

	test("folds short specials after a season into it", () => {
		const { parts } = new Franchise(
			[
				new Fixture(163_139, "My Hero Academia", "TV", "2024-05-04").title,
				new Fixture(182_896, "My Hero Academia FINAL SEASON", "TV", "2025-10-04").title,
				{
					...new Fixture(204_356, "My Hero Academia More", "SPECIAL", "2026-05-02").title,
					episodeCount: 1,
				},
				{
					...new Fixture(211_711, "My Hero Academia: I am a hero too", "SPECIAL", "2026-08-03")
						.title,
					episodeCount: 1,
				},
			],
			[
				[163_139, 182_896],
				[182_896, 204_356],
				[204_356, 211_711],
			],
		);

		expect(parts.map((part) => [part.title, part.role, part.season_id])).toEqual([
			["Season 1", "season", null],
			["FINAL SEASON", "season", null],
			["More", "special", "series-182896"],
			["I am a hero too", "special", "series-182896"],
		]);
		expect(parts[1]?.next_series_id).toBe("series-204356");
		expect(parts[2]?.next_series_id).toBe("series-211711");
	});

	test("names a story's seasons without the numbering its first title ends with", () => {
		const { parts } = new Franchise(
			[
				new Fixture(1, "The Seven Deadly Sins: Grudge of Edinburgh Part 1", "ONA", "2022-12-20")
					.title,
				new Fixture(2, "The Seven Deadly Sins: Grudge of Edinburgh Part 2", "ONA", "2023-08-31")
					.title,
				new Fixture(3, "Fate/strange Fake (Zoku-hen)", "TV", "2024-01-01").title,
				new Fixture(
					4,
					"The Seven Deadly Sins: Grudge of Edinburgh x Crossover",
					"ONA",
					"2024-01-01",
				).title,
			],
			[[1, 2]],
		);

		expect(parts.map((part) => part.title).slice(0, 2)).toEqual(["Part 1", "Part 2"]);
		expect(parts.map((part) => part.title)).toContain(
			"The Seven Deadly Sins: Grudge of Edinburgh x Crossover",
		);
	});

	test("drops a release qualifier and keeps a bracketed name whole", () => {
		const { parts } = new Franchise(
			[
				new Fixture(1, "Kingdom", "TV", "2012-06-04").title,
				new Fixture(2, "Kingdom (Zoku-hen)", "TV", "2013-06-08").title,
				new Fixture(3, "Kingdom 2nd Season (Web)", "ONA", "2014-01-01").title,
			],
			[
				[1, 2],
				[2, 3],
			],
		);

		expect(parts.map((part) => part.title)).toEqual(["Season 1", "Zoku-hen", "Season 2"]);
	});
});
