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
    expect(isEpisodeReleased(title, {
      ...episode,
      airedAt: null,
    }, now)).toBe(false);
    expect(isEpisodeReleased(title, {
      ...episode,
      airedAt: null,
    }, new Date("2026-09-28T00:00:00Z"))).toBe(true);
  });
});

describe("isEpisodeAvailable", () => {
  test("is what AniKoto carries, whatever the dates say", () => {
    expect(isEpisodeAvailable(title, episode, onAniKoto(13, 14), now)).toBe(true);
    expect(isEpisodeAvailable(title, episode, onAniKoto(13), now)).toBe(false);
    expect(isEpisodeAvailable(title, {
      ...episode,
      airedAt: null,
    }, onAniKoto(14), now)).toBe(true);
  });

  test("goes by the release dates until AniKoto has been looked up", () => {
    expect(isEpisodeAvailable(title, episode, notLookedUp, now)).toBe(true);
    expect(isEpisodeAvailable(title, episode, notLookedUp, new Date("2026-09-27T14:00:00Z"))).toBe(false);
  });

  test("is never an extra only TMDB lists", () => {
    expect(isEpisodeAvailable(title, {
      ...episode,
      anilistId: null,
      anilistEpisode: null,
    }, onAniKoto(14), now)).toBe(false);
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
    expect(isEpisodeShown(title, season, {
      ...episode,
      tmdbEpisodeNumber: null,
    }, onAniKoto(14), now)).toBe(false);
  });

  test("lists a film, or an episode of a title TMDB does not list, once AniKoto carries it", () => {
    const unlisted = {
      ...episode,
      tmdbEpisodeNumber: null,
    };
    expect(isEpisodeShown(title, {
      kind: "movie",
    }, unlisted, onAniKoto(14), now)).toBe(true);
    expect(isEpisodeShown({
      ...title,
      kind: "standalone",
    }, season, unlisted, onAniKoto(14), now)).toBe(true);
    expect(isEpisodeShown({
      ...title,
      kind: "standalone",
    }, season, unlisted, onAniKoto(13), now)).toBe(false);
  });

  test("lists an extra only TMDB lists", () => {
    expect(isEpisodeShown(title, season, {
      ...episode,
      anilistId: null,
      anilistEpisode: null,
    }, onAniKoto(), now)).toBe(true);
  });
});
