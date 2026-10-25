import { describe, expect, test } from "bun:test";

import type { TmdbEpisode, TmdbMovieResult } from "../tmdb/resources";
import {
	bestSimilarity,
	continuesPastLinks,
	placeAfterInCollection,
	placeAsMovie,
	placeInShow,
	placeInEpisodeGroups,
	titleSimilarity,
} from "./matching";
import type { MatchSubject, ShowCandidate } from "./matching";

const addDays = (date: string, days: number) =>
	new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** A weekly run of TMDB episodes, numbered from `first`. Dates are `null` when `start` is. */
const weekly = (
	season: number,
	start: string | null,
	count: number,
	options: {
		first?: number;
		runtime?: number;
	} = {},
): TmdbEpisode[] => {
	const first = options.first ?? 1;
	return Array.from(
		{
			length: count,
		},
		(_, index) => ({
			air_date: start ? addDays(start, index * 7) : null,
			episode_number: first + index,
			id: season * 10_000 + first + index,
			name: null,
			overview: null,
			runtime: options.runtime ?? 24,
			season_number: season,
			still_path: null,
		}),
	);
};

const special = (episode: number, airDate: string, runtime: number): TmdbEpisode => ({
	air_date: airDate,
	episode_number: episode,
	id: episode,
	name: null,
	overview: null,
	runtime,
	season_number: 0,
	still_path: null,
});

const subject = (overrides: Partial<MatchSubject>): MatchSubject => {
	const titles = overrides.titles ?? ["Example"];
	return {
		airsFrom: null,
		durationMinutes: 24,
		endDate: null,
		episodes: null,
		format: "TV",
		primaryTitleCount: titles.length,
		startDate: null,
		...overrides,
		titles,
	};
};

const show = (episodes: TmdbEpisode[], overrides: Partial<ShowCandidate> = {}): ShowCandidate => ({
	isFranchiseShow: false,
	prequel: null,
	show: {
		episodes,
		id: 1,
		name: "Example",
		originalName: "Example",
	},
	...overrides,
});

/** A prequel run through a season up to `episode`, from the season's first episode. */
const endingAt = (season: number, episode: number) => ({
	first: {
		episodeNumber: 1,
		seasonNumber: season,
	},
	last: {
		episodeNumber: episode,
		seasonNumber: season,
	},
});

const movie = (overrides: Partial<TmdbMovieResult>): TmdbMovieResult => ({
	id: 1,
	original_title: "Example",
	popularity: 1,
	release_date: null,
	title: "Example",
	...overrides,
});

const range = (placement: ReturnType<typeof placeInShow>) => {
	if (placement?.mediaType !== "tv") {
		return null;
	}

	return placement.episodes.map(
		(link) => `${link.anilistEpisode}:S${link.seasonNumber}E${link.episodeNumber}`,
	);
};

describe("placeInShow", () => {
	test("matches Saiki K.'s 120 shorts to the 24 compiled playback episodes", () => {
		const shorts = subject({
			durationMinutes: 5,
			endDate: "2016-12-26",
			episodes: 120,
			format: "TV_SHORT",
			playbackEpisodes: 24,
			startDate: "2016-07-04",
			titles: ["The Disastrous Life of Saiki K."],
		});
		const candidate = show(weekly(1, "2016-07-11", 24, { runtime: 23 }), {
			show: {
				episodes: weekly(1, "2016-07-11", 24, { runtime: 23 }),
				id: 67_676,
				name: "The Disastrous Life of Saiki K.",
				originalName: "斉木楠雄のΨ難",
			},
		});
		const placement = placeInShow(shorts, candidate);
		expect(placement?.method).toBe("compilation");
		expect(placement?.tmdbId).toBe(67_676);
		expect(range(placement)).toHaveLength(24);
		expect(range(placement)?.at(-1)).toBe("24:S1E24");
		for (const invalid of [
			{ playbackEpisodes: null },
			{ playbackEpisodes: 12 },
			{ playbackEpisodes: 120 },
			{ episodes: 119 },
			{ durationMinutes: null },
			{ durationMinutes: 2 },
			{ startDate: null },
			{ startDate: "2015-07-04" },
			{ endDate: "2018-12-26" },
			{ titles: ["A different short adaptation"] },
		]) {
			expect(placeInShow({ ...shorts, ...invalid }, candidate)?.method).not.toBe("compilation");
		}
		expect(
			range(placeInShow({ ...shorts, durationMinutes: 23, format: "TV" }, candidate)),
		).toHaveLength(24);
	});
	test("maps a streaming batch to its later weekly franchise broadcast", () => {
		const candidate = show(
			[
				...weekly(4, "2018-10-06", 39),
				...weekly(5, "2022-01-08", 12),
				...weekly(5, "2022-10-08", 26, { first: 13 }),
			],
			{ isFranchiseShow: true, prequel: endingAt(4, 39) },
		);
		const first = placeInShow(
			subject({ endDate: "2021-12-01", episodes: 12, format: "ONA", startDate: "2021-12-01" }),
			candidate,
		);
		expect(range(first)).toEqual(Array.from({ length: 12 }, (_, i) => `${i + 1}:S5E${i + 1}`));
		const second = placeInShow(
			subject({ endDate: "2022-12-01", episodes: 26, format: "ONA", startDate: "2022-09-01" }),
			{ ...candidate, prequel: endingAt(5, 12) },
		);
		expect(range(second)).toEqual(Array.from({ length: 26 }, (_, i) => `${i + 1}:S5E${i + 13}`));
	});

	test("matches a complete first season when a preview predates its broadcast", () => {
		const placement = placeInShow(
			subject({ endDate: "2013-09-21", episodes: 12, startDate: "2013-06-23" }),
			show([...weekly(1, "2013-07-06", 12), ...weekly(2, "2015-04-06", 12)]),
		);
		expect(range(placement)).toEqual(Array.from({ length: 12 }, (_, i) => `${i + 1}:S1E${i + 1}`));
	});

	test("matches a complete streaming season broadcast across a year boundary", () => {
		const placement = placeInShow(
			subject({ endDate: "2021-11-25", episodes: 11, format: "ONA", startDate: "2021-09-16" }),
			show(weekly(1, "2022-01-13", 11)),
		);
		expect(range(placement)).toHaveLength(11);
	});

	test("does not use a delayed streaming continuation without a proven prequel", () => {
		expect(
			placeInShow(
				subject({ endDate: "2021-12-01", episodes: 12, format: "ONA", startDate: "2021-12-01" }),
				show(weekly(5, "2022-01-08", 38), { isFranchiseShow: true }),
			),
		).toBeNull();
	});

	test("does not let delayed streaming releases cross seasons or distant premieres", () => {
		const candidate = show(
			[
				...weekly(4, "2018-10-06", 39),
				...weekly(5, "2022-01-08", 10),
				...weekly(6, "2022-04-01", 2),
			],
			{ isFranchiseShow: true, prequel: endingAt(4, 39) },
		);
		const entry = subject({
			endDate: "2021-12-01",
			episodes: 12,
			format: "ONA",
			startDate: "2021-12-01",
		});
		expect(placeInShow(entry, candidate)).toBeNull();
		expect(placeInShow({ ...entry, episodes: 10, startDate: "2021-01-01" }, candidate)).toBeNull();
	});

	test("title fallback rejects mismatched runtimes and already-aired upcoming seasons", () => {
		const candidate = show(weekly(1, "2022-01-13", 11));
		const entry = subject({ episodes: 11, format: "ONA", startDate: "2021-09-16" });
		expect(placeInShow({ ...entry, durationMinutes: 3 }, candidate)).toBeNull();
		expect(placeInShow({ ...entry, airsFrom: "2022-02-01" }, candidate)).toBeNull();
	});

	test("places the second cour of a split season mid-season", () => {
		// Tensura keeps "Season 2" and "Season 2 Part 2" in one 24-episode TMDB season.
		const episodes = [
			...weekly(1, "2018-10-02", 24),
			...weekly(2, "2021-01-12", 12),
			...weekly(2, "2021-07-06", 12, {
				first: 13,
			}),
		];

		const placement = placeInShow(
			subject({
				endDate: "2021-09-21",
				episodes: 12,
				startDate: "2021-07-06",
			}),
			show(episodes),
		);

		expect(range(placement)?.[0]).toBe("1:S2E13");
		expect(range(placement)?.at(-1)).toBe("12:S2E24");
	});

	test("finds a later season inside a single long TMDB season", () => {
		// Re:Zero lists every cour in season 1; season 2 starts at episode 26.
		const episodes = [
			...weekly(1, "2016-04-04", 25),
			...weekly(1, "2020-07-08", 13, {
				first: 26,
			}),
		];

		const placement = placeInShow(
			subject({
				endDate: "2020-09-30",
				episodes: 13,
				startDate: "2020-07-08",
			}),
			show(episodes),
		);

		expect(range(placement)?.[0]).toBe("1:S1E26");
		expect(range(placement)).toHaveLength(13);
	});

	test("keeps AniList's episode count when TMDB's last episode airs after AniList's end date", () => {
		// Witch Hat Atelier: AniList airs episodes 1 and 2 on 2026-04-06 and ends
		// on 2026-06-22; TMDB airs one episode a week until 2026-06-29.
		const placement = placeInShow(
			subject({
				endDate: "2026-06-22",
				episodes: 13,
				format: "ONA",
				startDate: "2026-04-06",
			}),
			show(weekly(1, "2026-04-06", 13)),
		);

		expect(range(placement)).toHaveLength(13);
		expect(range(placement)?.at(-1)).toBe("13:S1E13");
	});

	test("does not take the next season's premiere when TMDB lists one episode fewer", () => {
		const placement = placeInShow(
			subject({
				endDate: "2020-03-23",
				episodes: 13,
				startDate: "2020-01-06",
			}),
			show([...weekly(1, "2020-01-06", 12), ...weekly(2, "2020-07-06", 12)]),
		);

		expect(range(placement)).toHaveLength(12);
	});

	test("does not give an upcoming season episodes that have already aired", () => {
		// Witch Hat Atelier Season 2, before TMDB's S1E13 went to season 1.
		const placement = placeInShow(
			subject({
				airsFrom: "2026-09-27",
			}),
			show(weekly(1, "2026-04-06", 13), {
				isFranchiseShow: true,
				prequel: endingAt(1, 12),
			}),
		);

		expect(placement).toBeNull();
	});

	test("continues a prequel with an upcoming season's announced episodes", () => {
		const placement = placeInShow(
			subject({
				airsFrom: "2026-09-27",
				startDate: "2027-10",
			}),
			show([...weekly(1, "2024-01-04", 24), ...weekly(2, "2027-10-01", 1)], {
				isFranchiseShow: true,
				prequel: endingAt(1, 24),
			}),
		);

		expect(range(placement)).toEqual(["1:S2E1"]);
	});

	test("spans several TMDB seasons for one long AniList entry", () => {
		const episodes = [...weekly(1, "2007-02-15", 32), ...weekly(2, "2007-09-27", 21)];

		const placement = placeInShow(
			subject({
				episodes: 53,
				startDate: "2007-02-15",
			}),
			show(episodes),
		);

		expect(range(placement)?.at(-1)).toBe("53:S2E21");
	});

	test("continues after the prequel when TMDB has no air dates", () => {
		const episodes = [...weekly(1, null, 12), ...weekly(2, null, 12)];

		const placement = placeInShow(
			subject({
				episodes: 12,
				startDate: "2010-01-01",
			}),
			show(episodes, {
				isFranchiseShow: true,
				prequel: endingAt(1, 12),
			}),
		);

		expect(placement?.method).toBe("continuation");
		expect(range(placement)?.[0]).toBe("1:S2E1");
	});

	test("never overlaps the prequel's episodes", () => {
		// Two entries starting the same day: the sequel must not reclaim the prequel's run.
		const episodes = weekly(1, "2020-01-01", 24);

		const placement = placeInShow(
			subject({
				episodes: 12,
				startDate: "2020-01-01",
			}),
			show(episodes, {
				prequel: endingAt(1, 12),
			}),
		);

		expect(range(placement)?.[0]).toBe("1:S1E13");
	});

	test("ignores a prequel that aired after the entry", () => {
		// Yuki Yuna is a Hero: AniList lists the Washio Sumi chapter, TMDB's
		// season 2 three years later, as a prequel of the first season.
		const placement = placeInShow(
			subject({
				episodes: 12,
				startDate: "2014-10-17",
			}),
			show([...weekly(1, "2014-10-17", 12), ...weekly(2, "2017-10-07", 6)], {
				isFranchiseShow: true,
				prequel: endingAt(2, 6),
			}),
		);

		expect(placement?.method).toBe("air-date");
		expect(range(placement)?.[0]).toBe("1:S1E1");
	});

	test("numbers a continuation from the entry's first episode even when dates are far off", () => {
		const placement = placeInShow(
			subject({
				episodes: 12,
				startDate: "2020-01-01",
			}),
			show(weekly(1, "2019-01-01", 24), {
				prequel: endingAt(1, 12),
			}),
		);

		expect(range(placement)?.[0]).toBe("1:S1E13");
	});

	test("offsets episodes when AniList counts an episode 0 that TMDB files as a special", () => {
		// Mushoku Tensei season 2: AniList starts a week before TMDB's S2E1.
		const episodes = [special(1, "2023-07-03", 24), ...weekly(2, "2023-07-10", 12)];

		const placement = placeInShow(
			subject({
				endDate: "2023-09-25",
				episodes: 13,
				startDate: "2023-07-03",
			}),
			show(episodes),
		);

		expect(range(placement)?.slice(0, 2)).toEqual(["1:S0E1", "2:S2E1"]);
		expect(range(placement)?.at(-1)).toBe("13:S2E12");
	});

	test("offsets episodes when AniList counts one episode more than TMDB's run", () => {
		const placement = placeInShow(
			subject({
				endDate: "2023-09-25",
				episodes: 13,
				startDate: "2023-07-03",
			}),
			show(weekly(2, "2023-07-10", 12)),
		);

		expect(range(placement)?.[0]).toBe("2:S2E1");
		expect(range(placement)?.at(-1)).toBe("13:S2E12");
	});

	test("does not offset episodes when TMDB premieres days later with no sign of an episode 0", () => {
		// Overgeared: AniList airs episode 1 on 2026-09-27, TMDB dates it 2026-10-02.
		const placement = placeInShow(
			subject({
				episodes: null,
				startDate: "2026-09-27",
			}),
			show(weekly(1, "2026-10-02", 6)),
		);

		expect(range(placement)?.[0]).toBe("1:S1E1");
	});

	test("continues into specials released after the broadcast run", () => {
		// Bakemonogatari: 12 broadcast episodes, the last 3 released online later.
		const episodes = [
			special(1, "2009-08-07", 24),
			special(2, "2009-11-03", 24),
			special(3, "2010-02-23", 24),
			special(4, "2010-06-25", 24),
			...weekly(1, "2009-07-03", 12),
		];

		const placement = placeInShow(
			subject({
				endDate: "2010-06-25",
				episodes: 15,
				startDate: "2009-07-03",
			}),
			show(episodes),
		);

		expect(range(placement)?.slice(11)).toEqual(["12:S1E12", "13:S0E2", "14:S0E3", "15:S0E4"]);
	});

	test("skips interleaved extras of a different length among specials", () => {
		// Attack on Titan's OVA shares season 0 with short chibi episodes.
		const episodes = [
			special(7, "2013-12-09", 24),
			special(8, "2013-12-18", 13),
			special(9, "2014-01-15", 14),
			special(10, "2014-02-19", 10),
			special(13, "2014-04-09", 25),
			special(14, "2014-08-08", 24),
		];

		const placement = placeInShow(
			subject({
				durationMinutes: 25,
				endDate: "2014-08-08",
				episodes: 3,
				format: "OVA",
				startDate: "2013-12-09",
			}),
			show(episodes),
		);

		expect(range(placement)).toEqual(["1:S0E7", "2:S0E13", "3:S0E14"]);
	});

	test("does not place shorts on regular episodes airing the same week", () => {
		// Re:Zero Break Time: three-minute shorts alongside the main broadcast.
		const episodes = [
			...weekly(1, "2016-04-04", 25, {
				runtime: 25,
			}),
			...weekly(0, "2016-04-05", 11, {
				runtime: 3,
			}),
		];

		const placement = placeInShow(
			subject({
				durationMinutes: 3,
				endDate: "2016-06-21",
				episodes: 11,
				format: "TV_SHORT",
				startDate: "2016-04-08",
			}),
			show(episodes),
		);

		expect(range(placement)?.[0]).toBe("1:S0E1");
	});

	test("never places a special on a regular episode", () => {
		const episodes = weekly(1, "2003-05-01", 20);

		const placement = placeInShow(
			subject({
				endDate: "2003-05-22",
				episodes: 1,
				format: "SPECIAL",
				startDate: "2003-05-22",
			}),
			show(episodes),
		);

		expect(placement).toBeNull();
	});

	test("places an OVA series that TMDB lists as a show of its own", () => {
		const placement = placeInShow(
			subject({
				durationMinutes: 45,
				endDate: "1996-01-21",
				episodes: 2,
				format: "OVA",
				startDate: "1995-12-16",
			}),
			show([
				{
					...special(1, "1995-12-16", 45),
					season_number: 1,
				},
				{
					...special(2, "1996-01-21", 45),
					season_number: 1,
				},
			]),
		);

		expect(range(placement)).toEqual(["1:S1E1", "2:S1E2"]);
	});

	test("does not let a prequel OVA released days earlier claim the TV premiere", () => {
		const placement = placeInShow(
			subject({
				endDate: "2020-03-30",
				episodes: 1,
				format: "OVA",
				startDate: "2020-03-30",
			}),
			show(weekly(1, "2020-04-04", 12)),
		);

		expect(placement).toBeNull();
	});

	test("continues an OVA series in its franchise's show", () => {
		// Gundam MS IGLOO: three OVA series, one TMDB season each.
		const placement = placeInShow(
			subject({
				durationMinutes: 30,
				endDate: "2009-06-26",
				episodes: 3,
				format: "OVA",
				startDate: "2008-10-24",
			}),
			show(
				[
					...weekly(1, "2004-07-19", 3),
					...weekly(2, "2006-04-26", 3),
					...weekly(3, "2008-10-24", 3),
				],
				{
					isFranchiseShow: true,
					prequel: endingAt(2, 3),
				},
			),
		);

		expect(range(placement)?.[0]).toBe("1:S3E1");
	});

	test("does not continue a franchise show with an OVA released between seasons", () => {
		// Haikyu!! LAND VS. AIR came out two months before TO THE TOP.
		const placement = placeInShow(
			subject({
				endDate: "2019-11-04",
				episodes: 2,
				format: "OVA",
				startDate: "2019-11-04",
			}),
			show([...weekly(1, "2018-10-08", 10), ...weekly(2, "2020-01-11", 12)], {
				isFranchiseShow: true,
				prequel: endingAt(1, 10),
			}),
		);

		expect(placement).toBeNull();
	});

	test("does not let an OVA released the day before a season claim its premiere", () => {
		// Haikyu!! LAND VS. AIR: two episodes on 2020-01-10, TO THE TOP from 2020-01-11.
		const placement = placeInShow(
			subject({
				endDate: "2020-01-10",
				episodes: 2,
				format: "OVA",
				startDate: "2020-01-10",
			}),
			show([...weekly(1, "2018-10-08", 10), ...weekly(2, "2020-01-11", 12)], {
				isFranchiseShow: true,
				prequel: endingAt(1, 10),
			}),
		);

		expect(placement).toBeNull();
	});

	test("falls back to name, year, and episode count when air dates disagree", () => {
		const placement = placeInShow(
			subject({
				episodes: 24,
				startDate: "2006-07-02",
				titles: ["Le Chevalier D'Eon"],
			}),
			{
				...show(weekly(1, "2006-08-19", 24)),
				show: {
					episodes: weekly(1, "2006-08-19", 24),
					id: 1,
					name: "Le Chevalier D'Eon",
					originalName: "シュヴァリエ",
				},
			},
		);

		expect(placement?.method).toBe("title");
		expect(range(placement)).toHaveLength(24);
	});

	test("prefers the franchise's own show over a same-dated duplicate", () => {
		const episodes = [special(36, "2023-03-04", 61)];
		const specialSubject = subject({
			durationMinutes: 61,
			endDate: "2023-03-04",
			episodes: 1,
			format: "SPECIAL",
			startDate: "2023-03-04",
		});

		const franchise = placeInShow(
			specialSubject,
			show(episodes, {
				isFranchiseShow: true,
			}),
		);
		const duplicate = placeInShow(
			specialSubject,
			show([
				{
					...special(1, "2023-03-04", 61),
					season_number: 1,
				},
			]),
		);

		expect(franchise?.score).toBeGreaterThan(duplicate?.score ?? 0);
	});

	test("places a rerun's new episodes when the entry's start date is the rerun's", () => {
		const episodes = [
			...weekly(1, "2006-04-03", 14),
			...weekly(1, "2009-05-22", 14, {
				first: 15,
			}),
		];
		const rerun = subject({
			endDate: "2009-10-09",
			episodes: 28,
			playbackEpisodes: 14,
			startDate: "2009-04-03",
			titles: ["The Melancholy of Haruhi Suzumiya (2009)"],
		});
		const candidate = {
			...show(episodes),
			show: {
				episodes,
				id: 1,
				name: "The Melancholy of Haruhi Suzumiya",
				originalName: "涼宮ハルヒの憂鬱",
			},
		};

		const placement = placeInShow(rerun, candidate);

		expect(range(placement)?.[0]).toBe("1:S1E15");
		expect(range(placement)?.at(-1)).toBe("14:S1E28");

		expect(placeInShow({ ...rerun, playbackEpisodes: 13 }, candidate)).toBeNull();
		expect(
			placeInShow(rerun, {
				...candidate,
				prequel: endingAt(1, 20),
			}),
		).toBeNull();
	});

	test("rejects a show whose episodes air far from the entry's dates", () => {
		const placement = placeInShow(
			subject({
				episodes: 12,
				startDate: "2019-04-06",
			}),
			show(weekly(1, "2015-01-01", 12)),
		);

		expect(placement).toBeNull();
	});
});

describe("placeInShow by special name", () => {
	// Haikyu!!: TMDB dates Land vs. Air twelve days after AniList, and Lev
	// Appears four months after, beyond the air-date window.
	const named = (episode: number, airDate: string, name: string) => ({
		...special(episode, airDate, 24),
		name,
	});
	const haikyu = (overrides: Partial<ShowCandidate> = {}): ShowCandidate => ({
		isFranchiseShow: true,
		prequel: null,
		show: {
			episodes: [
				...weekly(1, "2014-04-06", 3),
				named(1, "2015-03-04", "Lev Appears!"),
				named(2, "2020-01-22", "Land vs. Air"),
				named(3, "2020-01-22", "The Path of the Ball"),
				named(4, "2020-03-04", "Puppet Theatre"),
			],
			id: 60_863,
			name: "Haikyu!!",
			originalName: "ハイキュー!!",
		},
		...overrides,
	});

	test("finds an OVA among its franchise's specials by what its title adds to the show's", () => {
		const placement = placeInShow(
			subject({
				episodes: 2,
				format: "OVA",
				primaryTitleCount: 2,
				startDate: "2020-01-10",
				titles: ["HAIKYU!! LAND VS. AIR", "Haikyuu!! Riku VS Kuu"],
			}),
			haikyu(),
		);

		expect(placement?.method).toBe("title");
		expect(range(placement)).toEqual(["1:S0E2", "2:S0E3"]);
	});

	test("accepts dates months apart", () => {
		const placement = placeInShow(
			subject({
				episodes: 1,
				format: "OVA",
				startDate: "2014-11-09",
				titles: ["HAIKYU!!: Lev Appears!"],
			}),
			haikyu(),
		);

		expect(range(placement)).toEqual(["1:S0E1"]);
	});

	test("only matches in the franchise's own show", () => {
		expect(
			placeInShow(
				subject({
					episodes: 1,
					format: "OVA",
					startDate: "2014-11-09",
					titles: ["HAIKYU!!: Lev Appears!"],
				}),
				haikyu({
					isFranchiseShow: false,
				}),
			),
		).toBeNull();
	});

	test("rejects a special aired more than a year away", () => {
		expect(
			placeInShow(
				subject({
					episodes: 1,
					format: "OVA",
					startDate: "2018-01-01",
					titles: ["HAIKYU!!: Lev Appears!"],
				}),
				haikyu(),
			),
		).toBeNull();
	});
});

describe("placeInShow by the end of a run of specials", () => {
	// TONIKAWA: AniList has High School Days from 2023-07-12, and TMDB files
	// its four episodes under specials from 2023-08-02. Both end on 2023-08-23.
	const tonikawa = (
		specials: TmdbEpisode[],
		overrides: Partial<ShowCandidate> = {},
	): ShowCandidate => ({
		isFranchiseShow: true,
		prequel: endingAt(2, 12),
		show: {
			episodes: [
				...weekly(1, "2020-10-03", 12),
				...weekly(2, "2023-04-08", 12),
				special(14, "2021-08-18", 24),
				special(15, "2022-11-22", 22),
				...specials,
			],
			id: 100_049,
			name: "TONIKAWA: Over The Moon For You",
			originalName: "トニカクカワイイ",
		},
		...overrides,
	});
	const highSchoolDays = subject({
		endDate: "2023-08-23",
		episodes: 4,
		format: "ONA",
		startDate: "2023-07-12",
		titles: ["TONIKAWA: Over The Moon For You ~High School Days~"],
	});
	const fromAugust = [
		special(16, "2023-08-02", 24),
		special(17, "2023-08-09", 24),
		special(18, "2023-08-16", 24),
		special(19, "2023-08-23", 24),
	];

	test("finds a run that starts weeks after AniList's start and ends on its end date", () => {
		const placement = placeInShow(highSchoolDays, tonikawa(fromAugust));

		expect(placement?.method).toBe("air-date");
		expect(range(placement)).toEqual(["1:S0E16", "2:S0E17", "3:S0E18", "4:S0E19"]);
	});

	test("leaves out extras of another length released during the run", () => {
		const placement = placeInShow(
			highSchoolDays,
			tonikawa([...fromAugust.slice(0, 2), special(20, "2023-08-12", 2), ...fromAugust.slice(2)]),
		);

		expect(range(placement)).toEqual(["1:S0E16", "2:S0E17", "3:S0E18", "4:S0E19"]);
	});

	test("rejects a run with more specials than the entry has episodes", () => {
		expect(
			placeInShow(highSchoolDays, tonikawa([special(20, "2023-07-26", 24), ...fromAugust])),
		).toBeNull();
	});

	test("rejects a run that ends before AniList's end date", () => {
		expect(
			placeInShow(
				{
					...highSchoolDays,
					endDate: "2023-09-13",
				},
				tonikawa(fromAugust),
			),
		).toBeNull();
	});

	test("only matches in the franchise's own show", () => {
		expect(
			placeInShow(
				highSchoolDays,
				tonikawa(fromAugust, {
					isFranchiseShow: false,
					prequel: null,
				}),
			),
		).toBeNull();
	});
});

describe("placeAsMovie", () => {
	test("accepts a film released on the entry's start date", () => {
		const placement = placeAsMovie(
			subject({
				format: "MOVIE",
				startDate: "2020-10-16",
				titles: ["Demon Slayer -Kimetsu no Yaiba- The Movie: Mugen Train"],
			}),
			movie({
				release_date: "2020-10-16",
				title: "Demon Slayer -Kimetsu no Yaiba- The Movie: Mugen Train",
			}),
		);

		expect(placement?.method).toBe("release-date");
	});

	test("rejects a bonus short named after a film released months earlier", () => {
		const placement = placeAsMovie(
			subject({
				format: "OVA",
				primaryTitleCount: 1,
				startDate: "2022-02-16",
				titles: [
					"Boku no Hero Academia THE MOVIE: World Heroes' Mission - Tabidachi",
					"My Hero Academia: World Heroes' Mission",
				],
			}),
			movie({
				release_date: "2021-08-06",
				title: "My Hero Academia: World Heroes' Mission",
			}),
		);

		expect(placement).toBeNull();
	});

	test("rejects a bonus short released with a film, once the film's runtime is known", () => {
		// Macross Frontier: Chou Jikuu Gekijou came out with The Wings of Farewell.
		const short = subject({
			durationMinutes: 3,
			episodes: 1,
			format: "OVA",
			startDate: "2011-02-26",
			titles: ["Macross Frontier: Chou Jikuu Gekijou"],
		});
		const film = {
			...movie({
				original_title: "劇場版マクロスF 恋離飛翼～サヨナラノツバサ～",
				release_date: "2011-02-26",
				title: "Macross Frontier: The Wings of Farewell",
			}),
			runtime: 115,
		};

		expect(placeAsMovie(short, film)).toBeNull();
		expect(
			placeAsMovie(
				{
					...short,
					durationMinutes: 115,
					format: "MOVIE",
				},
				film,
			)?.method,
		).toBe("release-date");
	});

	test("accepts a hinted film whose premiere predates the entry's broadcast", () => {
		// Go-toubun no Hanayome Specials: two 24-minute episodes, a 61-minute film on TMDB.
		const special = subject({
			episodes: 2,
			format: "SPECIAL",
			startDate: "2023-09-02",
			titles: ["The Quintessential Quintuplets Specials", "Go-toubun no Hanayome∽"],
		});
		const film = {
			...movie({
				id: 1_153_706,
				release_date: "2023-07-14",
				title: "The Quintessential Quintuplets∽",
			}),
			runtime: 61,
		};

		expect(placeAsMovie(special, film)).toBeNull();
		expect(placeAsMovie(special, film, true)).toMatchObject({
			method: "hint",
			tmdbId: 1_153_706,
		});
		expect(placeAsMovie(special, { ...film, runtime: 300 }, true)).toBeNull();
	});

	test("accepts a film that runs as long as a special's episodes together", () => {
		const special = subject({
			episodes: 2,
			format: "SPECIAL",
			startDate: "2024-09-20",
			titles: ["The Quintessential Quintuplets Specials 2", "The Quintessential Quintuplets*"],
		});

		expect(
			placeAsMovie(special, {
				...movie({
					original_title: "五等分の花嫁＊",
					release_date: "2024-09-20",
					title: "The Quintessential Quintuplets＊",
				}),
				runtime: 47,
			})?.method,
		).toBe("release-date");
	});

	test("accepts an unreleased film only on a near-exact title", () => {
		const upcoming = subject({
			format: "MOVIE",
			titles: ["Demon Slayer: Kimetsu no Yaiba Infinity Castle Part 2"],
		});

		expect(
			placeAsMovie(
				upcoming,
				movie({
					title: "Demon Slayer: Kimetsu no Yaiba Infinity Castle Part 2",
				}),
			)?.method,
		).toBe("title");
		expect(
			placeAsMovie(
				upcoming,
				movie({
					release_date: "2025-07-18",
					title: "Demon Slayer: Kimetsu no Yaiba Infinity Castle",
				}),
			),
		).toBeNull();
	});
});

describe("placeAfterInCollection", () => {
	// Haikyu!! Final Arc Collection: the second film has no release date yet.
	const parts = [
		movie({
			id: 1_012_199,
			release_date: null,
			title: "HAIKYU!! VS The Little Giant",
		}),
		movie({
			id: 1_012_201,
			release_date: "2024-02-16",
			title: "HAIKYU!! The Dumpster Battle",
		}),
	];
	const littleGiant = subject({
		format: "MOVIE",
		startDate: "2027",
		titles: ["Haikyuu!!: VS Chiisana Kyojin"],
	});

	test("takes the film after the prequel's, however unlike the titles", () => {
		expect(placeAfterInCollection(littleGiant, 1_012_201, parts)).toMatchObject({
			mediaType: "movie",
			method: "continuation",
			tmdbId: 1_012_199,
		});
	});

	test("rejects a next film released in another year", () => {
		expect(
			placeAfterInCollection(
				subject({
					format: "MOVIE",
					startDate: "2025-06-01",
				}),
				1_012_201,
				[
					...parts.slice(1),
					movie({
						id: 3,
						release_date: "2027-03-01",
					}),
				],
			),
		).toBeNull();
	});

	test("finds nothing after the collection's last film", () => {
		expect(placeAfterInCollection(littleGiant, 1_012_199, parts)).toBeNull();
	});
});

describe("titleSimilarity", () => {
	test("ignores case, punctuation, and full-width characters", () => {
		expect(
			titleSimilarity(
				"Re:ZERO -Starting Life in Another World-",
				"re zero starting life in another world",
			),
		).toBe(1);
		expect(titleSimilarity("ＮＡＲＵＴＯ", "Naruto")).toBe(1);
	});

	test("scores unrelated titles low", () => {
		expect(titleSimilarity("Attack on Titan", "Mushoku Tensei")).toBeLessThan(0.2);
	});
});

describe("bestSimilarity with sameNumbers", () => {
	const same = (a: string, b: string) => bestSimilarity([a], [b], { sameNumbers: true }) > 0;

	test("tells roman numerals apart", () => {
		expect(same("Overlord II", "Overlord III")).toBe(false);
		expect(same("Overlord III", "Overlord III")).toBe(true);
		expect(same("Overlord II", "Overlord 2")).toBe(true);
	});

	test("reads any roman numeral, not a fixed list", () => {
		expect(same("Show XXI", "Show 21")).toBe(true);
		expect(same("Show XL", "Show 40")).toBe(true);
		expect(same("Show LIV", "Show 54")).toBe(true);
		expect(same("Show XXIV", "Show XXV")).toBe(false);
	});

	test("leaves words that merely look like numerals", () => {
		expect(same("Mix", "Mild")).toBe(true);
		expect(same("Civil War", "Civil War")).toBe(true);
	});

	test("tells numbers written as words apart", () => {
		expect(same("Slime Season Two", "Slime Season 3")).toBe(false);
		expect(same("Slime Second Season", "Slime Season 2")).toBe(true);
		expect(same("Slime Third Season", "Slime 2nd Season")).toBe(false);
	});

	test("leaves a lone letter alone", () => {
		expect(same("Gundam X", "Gundam X")).toBe(true);
		expect(same("Mix", "Mix")).toBe(true);
	});
});

describe("continuesPastLinks", () => {
	const show = {
		episodes: weekly(1, "2026-10-03", 13),
	};

	test("sees the second episode of a double premiere TMDB listed after the match", () => {
		expect(
			continuesPastLinks(show, [
				{
					anilistEpisode: 1,
					episodeNumber: 1,
					seasonNumber: 1,
				},
			]),
		).toBe(true);
	});

	test("finds nothing once the links reach the show's last episode", () => {
		expect(
			continuesPastLinks(
				{
					episodes: weekly(1, "2026-10-03", 2),
				},
				[
					{
						anilistEpisode: 1,
						episodeNumber: 1,
						seasonNumber: 1,
					},
					{
						anilistEpisode: 2,
						episodeNumber: 2,
						seasonNumber: 1,
					},
				],
			),
		).toBe(false);
	});

	test("finds nothing for an entry without links", () => {
		expect(continuesPastLinks(show, [])).toBe(false);
	});
});

describe("placeInEpisodeGroups", () => {
	const first = weekly(5, "2022-01-08", 12).map((episode, order) => ({ ...episode, order }));
	const second = weekly(5, "2022-10-08", 12, { first: 13 }).map((episode, order) => ({
		...episode,
		order,
	}));
	const final = weekly(5, "2023-01-07", 14, { first: 25 }).map((episode, order) => ({
		...episode,
		order,
	}));
	const stage = weekly(6, "2026-03-19", 1, { runtime: 49 }).map((episode, order) => ({
		...episode,
		order,
	}));
	const candidate = show([...first, ...second, ...final, ...stage]).show;
	const groups = [
		{ episodes: first, name: "JoJo's Bizarre Adventure: STONE OCEAN", order: 1 },
		{ episodes: second, name: "JoJo's Bizarre Adventure: STONE OCEAN Part 2 ", order: 2 },
		{ episodes: final, name: "JoJo's Bizarre Adventure: STONE OCEAN Part 3", order: 3 },
		{ episodes: stage, name: "STEEL BALL RUN JoJo's Bizarre Adventure 1st STAGE", order: 4 },
	];
	const entry = subject({
		episodes: 12,
		format: "ONA",
		startDate: "2021-12-01",
		titles: ["JoJo's Bizarre Adventure: STONE OCEAN"],
	});

	test("uses the named Stone Ocean batch despite its later TV dates", () => {
		const placed = placeInEpisodeGroups(entry, candidate, [groups]);
		expect(placed?.method).toBe("episode-group");
		expect(range(placed)).toEqual(Array.from({ length: 12 }, (_, i) => `${i + 1}:S5E${i + 1}`));
	});

	test("combines numbered TMDB parts when AniList lists them as one release", () => {
		const placed = placeInEpisodeGroups(
			{
				...entry,
				episodes: 26,
				startDate: "2022-09-01",
				titles: ["JoJo's Bizarre Adventure: STONE OCEAN Part 2"],
			},
			candidate,
			[groups],
		);
		expect(range(placed)).toEqual(Array.from({ length: 26 }, (_, i) => `${i + 1}:S5E${i + 13}`));
	});

	test("keeps Steel Ball Run on its parent show's canonical episode", () => {
		const placed = placeInEpisodeGroups(
			subject({
				durationMinutes: 47,
				episodes: 1,
				format: "ONA",
				startDate: "2026-03-19",
				titles: ["STEEL BALL RUN JoJo's Bizarre Adventure 1st STAGE"],
			}),
			candidate,
			[groups],
		);
		expect(range(placed)).toEqual(["1:S6E1"]);
	});

	test("rejects conflicting arrangements, wrong counts, and already-aired upcoming releases", () => {
		expect(
			placeInEpisodeGroups(entry, candidate, [
				groups,
				[{ episodes: second, name: entry.titles[0] ?? "", order: 1 }],
			]),
		).toBeNull();
		expect(placeInEpisodeGroups({ ...entry, episodes: 13 }, candidate, [groups])).toBeNull();
		expect(
			placeInEpisodeGroups({ ...entry, airsFrom: "2023-01-01" }, candidate, [groups]),
		).toBeNull();
	});

	test("rejects stale group identities and a differently numbered part", () => {
		expect(placeInEpisodeGroups(entry, { ...candidate, episodes: [] }, [groups])).toBeNull();
		expect(
			placeInEpisodeGroups(
				{ ...entry, titles: ["JoJo's Bizarre Adventure: STONE OCEAN Part 4"] },
				candidate,
				[groups],
			),
		).toBeNull();
	});
});
