import { describe, expect, mock, test } from "bun:test";

mock.module("../database/client", () => ({
	db: {},
}));
mock.module("../playback/providers/registry", () => ({
	aniKoto: {
		id: "anikoto",
	},
}));

const {
	anilistEpisodeKey,
	isEpisodeAvailable,
	expectedRelease,
	isEpisodeAwaited,
	isEpisodeReleased,
	isEpisodeShown,
} = await import("./episodes");

const now = new Date("2026-09-27T16:00:00Z");

/** A title with nothing announced, TMDB listing it. */
const title = {
	kind: "tv" as const,
	nextEpisodeSeasonId: null,
	nextEpisodeNumber: null,
	nextEpisodeAiringAt: null,
};

const season = {
	kind: "season" as const,
};

/** Episode 14 of AniList entry 178789, which TMDB lists and dates a day after its broadcast. */
const episode = {
	seasonId: "S3",
	number: 14,
	anilistId: 178789,
	anilistEpisode: 14,
	airDate: "2026-09-28",
	airedAt: new Date("2026-09-27T15:00:00Z"),
	tmdbEpisodeNumber: 14,
};

/** AniKoto, looked up for entry 178789, carrying `episodes` of it. */
function onAniKoto(...episodes: number[]) {
	return {
		carried: new Set(episodes.map((number) => anilistEpisodeKey(178789, number))),
		lookedUp: new Set([178789]),
	};
}

const notLookedUp = {
	carried: new Set<string>(),
	lookedUp: new Set<number>(),
};

describe("isEpisodeReleased", () => {
	test("goes by AniList's broadcast time over TMDB's date in Japan's calendar", () => {
		expect(isEpisodeReleased(title, episode, now)).toBe(true);
		expect(isEpisodeReleased(title, episode, new Date("2026-09-27T14:59:00Z"))).toBe(false);
	});

	test("goes by TMDB's date when AniList has no broadcast time", () => {
		expect(
			isEpisodeReleased(
				title,
				{
					...episode,
					airedAt: null,
				},
				now,
			),
		).toBe(false);
		expect(
			isEpisodeReleased(
				title,
				{
					...episode,
					airedAt: null,
				},
				new Date("2026-09-28T00:00:00Z"),
			),
		).toBe(true);
	});
});

describe("isEpisodeAvailable", () => {
	test("is what AniKoto carries, whatever the dates say", () => {
		expect(isEpisodeAvailable(title, episode, onAniKoto(13, 14), now)).toBe(true);
		expect(isEpisodeAvailable(title, episode, onAniKoto(13), now)).toBe(false);
		expect(
			isEpisodeAvailable(
				title,
				{
					...episode,
					airedAt: null,
				},
				onAniKoto(14),
				now,
			),
		).toBe(true);
	});

	test("goes by the release dates until AniKoto has been looked up", () => {
		expect(isEpisodeAvailable(title, episode, notLookedUp, now)).toBe(true);
		expect(isEpisodeAvailable(title, episode, notLookedUp, new Date("2026-09-27T14:00:00Z"))).toBe(
			false,
		);
	});

	test("is never an extra only TMDB lists", () => {
		expect(
			isEpisodeAvailable(
				title,
				{
					...episode,
					anilistId: null,
					anilistEpisode: null,
				},
				onAniKoto(14),
				now,
			),
		).toBe(false);
	});
});

describe("isEpisodeShown", () => {
	test("lists an episode AniKoto carries and TMDB lists", () => {
		expect(isEpisodeShown(title, season, episode, onAniKoto(14), now)).toBe(true);
	});

	test("leaves out an episode TMDB lists that AniKoto does not carry yet", () => {
		expect(isEpisodeShown(title, season, episode, onAniKoto(13), now)).toBe(false);
	});

	test("leaves out an episode AniKoto carries until TMDB lists it", () => {
		expect(
			isEpisodeShown(
				title,
				season,
				{
					...episode,
					tmdbEpisodeNumber: null,
				},
				onAniKoto(14),
				now,
			),
		).toBe(false);
	});

	test("lists a film, or an episode of a title TMDB does not list, once AniKoto carries it", () => {
		const unlisted = {
			...episode,
			tmdbEpisodeNumber: null,
		};
		expect(
			isEpisodeShown(
				title,
				{
					kind: "movie",
				},
				unlisted,
				onAniKoto(14),
				now,
			),
		).toBe(true);
		expect(
			isEpisodeShown(
				{
					...title,
					kind: "standalone",
				},
				season,
				unlisted,
				onAniKoto(14),
				now,
			),
		).toBe(true);
		expect(
			isEpisodeShown(
				{
					...title,
					kind: "standalone",
				},
				season,
				unlisted,
				onAniKoto(13),
				now,
			),
		).toBe(false);
	});

	test("lists an extra only TMDB lists", () => {
		expect(
			isEpisodeShown(
				title,
				season,
				{
					...episode,
					anilistId: null,
					anilistEpisode: null,
				},
				onAniKoto(),
				now,
			),
		).toBe(true);
	});
});

describe("isEpisodeAwaited", () => {
	test("is an aired episode that follows the latest AniKoto carries", () => {
		expect(isEpisodeAwaited(title, season, episode, onAniKoto(13), now)).toBe(true);
	});

	test("is a premiere AniKoto does not carry yet", () => {
		expect(
			isEpisodeAwaited(
				title,
				season,
				{
					...episode,
					number: 1,
					anilistEpisode: 1,
				},
				onAniKoto(),
				now,
			),
		).toBe(true);
	});

	test("is an episode AniKoto carries until TMDB lists it", () => {
		expect(
			isEpisodeAwaited(
				title,
				season,
				{
					...episode,
					tmdbEpisodeNumber: null,
				},
				onAniKoto(13, 14),
				now,
			),
		).toBe(true);
	});

	test("is not an episode its season lists, nor one still to air", () => {
		expect(isEpisodeAwaited(title, season, episode, onAniKoto(13, 14), now)).toBe(false);
		expect(
			isEpisodeAwaited(title, season, episode, onAniKoto(13), new Date("2026-09-27T14:59:00Z")),
		).toBe(false);
	});

	test("is not an episode AniKoto skipped, nor one of an entry it carries none of", () => {
		expect(isEpisodeAwaited(title, season, episode, onAniKoto(12, 15), now)).toBe(false);
		expect(isEpisodeAwaited(title, season, episode, onAniKoto(), now)).toBe(false);
	});

	test("is not an episode AniList has no broadcast time for", () => {
		expect(
			isEpisodeAwaited(
				title,
				season,
				{
					...episode,
					airedAt: null,
				},
				onAniKoto(13),
				now,
			),
		).toBe(false);
	});
});

describe("expectedRelease", () => {
	const airedAt = new Date("2026-09-27T15:00:00Z");

	test("is AniList's broadcast time when AnimeSchedule has none, or an earlier one", () => {
		expect(expectedRelease(airedAt, null, now)).toEqual(airedAt);
		expect(expectedRelease(airedAt, new Date("2026-09-27T14:30:00Z"), now)).toEqual(airedAt);
	});

	test("is AnimeSchedule's time when its stream follows the broadcast", () => {
		const streamedAt = new Date("2026-09-27T16:30:00Z");
		expect(expectedRelease(airedAt, streamedAt, now)).toEqual(streamedAt);
	});

	test("stops 12 hours after the episode was expected", () => {
		expect(expectedRelease(airedAt, null, new Date("2026-09-28T02:59:00Z"))).toEqual(airedAt);
		expect(expectedRelease(airedAt, null, new Date("2026-09-28T03:00:00Z"))).toBeNull();
	});

	test("goes on for an episode AnimeSchedule lists as put off", () => {
		const putOffTo = new Date("2026-10-04T15:00:00Z");
		expect(expectedRelease(airedAt, putOffTo, new Date("2026-09-30T00:00:00Z"))).toEqual(putOffTo);
		expect(expectedRelease(airedAt, putOffTo, new Date("2026-10-05T03:00:00Z"))).toBeNull();
	});
});
