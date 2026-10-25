import { describe, expect, test } from "bun:test";

import {
	anilistEpisodeKey,
	isEpisodeAvailable,
	expectedRelease,
	isEpisodeAwaited,
	isEpisodeReleased,
} from "./episodes";

const now = new Date("2026-09-27T16:00:00Z");

/** AniList entry 178789 with nothing announced, which TMDB lists in a show. */
const title = {
	anilistId: 178_789,
	kind: "tv" as const,
	nextEpisodeAiringAt: null,
	nextEpisodeNumber: null,
};

/** Its episode 14, which TMDB lists and dates a day after its broadcast. */
const episode = {
	airDate: "2026-09-28",
	airedAt: new Date("2026-09-27T15:00:00Z"),
	number: 14,
	tmdbEpisodeNumber: 14,
};

/** AniKoto, looked up for entry 178789, carrying `episodes` of it. */
const onAniKoto = (...episodes: number[]) => ({
	carried: new Set(episodes.map((number) => anilistEpisodeKey(178_789, number))),
	lookedUp: new Set([178_789]),
});

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

	test("is an episode AniKoto carries that TMDB does not list yet", () => {
		expect(
			isEpisodeAvailable(
				title,
				{
					...episode,
					tmdbEpisodeNumber: null,
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
});

describe("isEpisodeAwaited", () => {
	test("is an aired episode that follows the latest AniKoto carries", () => {
		expect(isEpisodeAwaited(title, episode, onAniKoto(13), now)).toBe(true);
	});

	test("is a premiere AniKoto does not carry yet", () => {
		expect(
			isEpisodeAwaited(
				title,
				{
					...episode,
					number: 1,
				},
				onAniKoto(),
				now,
			),
		).toBe(true);
	});

	test("is not an episode AniKoto carries, whether or not TMDB lists it", () => {
		expect(
			isEpisodeAwaited(
				title,
				{
					...episode,
					tmdbEpisodeNumber: null,
				},
				onAniKoto(13, 14),
				now,
			),
		).toBe(false);
	});

	test("is not an episode its series lists, nor one still to air", () => {
		expect(isEpisodeAwaited(title, episode, onAniKoto(13, 14), now)).toBe(false);
		expect(isEpisodeAwaited(title, episode, onAniKoto(13), new Date("2026-09-27T14:59:00Z"))).toBe(
			false,
		);
	});

	test("is not an episode AniKoto skipped, nor one of an entry it carries none of", () => {
		expect(isEpisodeAwaited(title, episode, onAniKoto(12, 15), now)).toBe(false);
		expect(isEpisodeAwaited(title, episode, onAniKoto(), now)).toBe(false);
	});

	test("is not an episode AniList has no broadcast time for", () => {
		expect(
			isEpisodeAwaited(
				title,
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
