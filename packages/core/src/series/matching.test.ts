import { describe, expect, test } from "bun:test";

import type { TmdbEpisode, TmdbMovieResult } from "../tmdb/resources";
import { placeAsMovie, placeInShow, titleSimilarity, type MatchSubject, type ShowCandidate } from "./matching";

/** A weekly run of TMDB episodes, numbered from `first`. Dates are `null` when `start` is. */
function weekly(
  season: number,
  start: string | null,
  count: number,
  options: {
    first?: number;
    runtime?: number;
  } = {}
): TmdbEpisode[] {
  const first = options.first ?? 1;
  return Array.from({ length: count }, (_, index) => ({
    season_number: season,
    episode_number: first + index,
    name: null,
    overview: null,
    air_date: start ? addDays(start, index * 7) : null,
    runtime: options.runtime ?? 24,
    still_path: null
  }));
}

function special(episode: number, airDate: string, runtime: number): TmdbEpisode {
  return {
    season_number: 0,
    episode_number: episode,
    name: null,
    overview: null,
    air_date: airDate,
    runtime,
    still_path: null
  };
}

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function subject(overrides: Partial<MatchSubject>): MatchSubject {
  const titles = overrides.titles ?? ["Example"];
  return {
    format: "TV",
    startDate: null,
    endDate: null,
    episodes: null,
    durationMinutes: 24,
    primaryTitleCount: titles.length,
    ...overrides,
    titles
  };
}

function show(episodes: TmdbEpisode[], overrides: Partial<ShowCandidate> = {}): ShowCandidate {
  return {
    show: {
      id: 1,
      name: "Example",
      originalName: "Example",
      episodes
    },
    isFranchiseShow: false,
    prequelEnd: null,
    ...overrides
  };
}

function movie(overrides: Partial<TmdbMovieResult>): TmdbMovieResult {
  return {
    id: 1,
    title: "Example",
    original_title: "Example",
    release_date: null,
    popularity: 1,
    ...overrides
  };
}

function range(placement: ReturnType<typeof placeInShow>) {
  if (placement?.mediaType !== "tv") {
    return null;
  }

  return placement.episodes.map((link) => `${link.anilistEpisode}:S${link.seasonNumber}E${link.episodeNumber}`);
}

describe("placeInShow", () => {
  test("places the second cour of a split season mid-season", () => {
    // Tensura keeps "Season 2" and "Season 2 Part 2" in one 24-episode TMDB season.
    const episodes = [
      ...weekly(1, "2018-10-02", 24),
      ...weekly(2, "2021-01-12", 12),
      ...weekly(2, "2021-07-06", 12, {
        first: 13
      })
    ];

    const placement = placeInShow(
      subject({
        startDate: "2021-07-06",
        endDate: "2021-09-21",
        episodes: 12
      }),
      show(episodes)
    );

    expect(range(placement)?.[0]).toBe("1:S2E13");
    expect(range(placement)?.at(-1)).toBe("12:S2E24");
  });

  test("finds a later season inside a single long TMDB season", () => {
    // Re:Zero lists every cour in season 1; season 2 starts at episode 26.
    const episodes = [
      ...weekly(1, "2016-04-04", 25),
      ...weekly(1, "2020-07-08", 13, {
        first: 26
      })
    ];

    const placement = placeInShow(
      subject({
        startDate: "2020-07-08",
        endDate: "2020-09-30",
        episodes: 13
      }),
      show(episodes)
    );

    expect(range(placement)?.[0]).toBe("1:S1E26");
    expect(range(placement)).toHaveLength(13);
  });

  test("spans several TMDB seasons for one long AniList entry", () => {
    const episodes = [
      ...weekly(1, "2007-02-15", 32),
      ...weekly(2, "2007-09-27", 21)
    ];

    const placement = placeInShow(
      subject({
        startDate: "2007-02-15",
        episodes: 53
      }),
      show(episodes)
    );

    expect(range(placement)?.at(-1)).toBe("53:S2E21");
  });

  test("continues after the prequel when TMDB has no air dates", () => {
    const episodes = [
      ...weekly(1, null, 12),
      ...weekly(2, null, 12)
    ];

    const placement = placeInShow(
      subject({
        startDate: "2010-01-01",
        episodes: 12
      }),
      show(episodes, {
        isFranchiseShow: true,
        prequelEnd: {
          seasonNumber: 1,
          episodeNumber: 12
        }
      })
    );

    expect(placement?.method).toBe("continuation");
    expect(range(placement)?.[0]).toBe("1:S2E1");
  });

  test("never overlaps the prequel's episodes", () => {
    // Two entries starting the same day: the sequel must not reclaim the prequel's run.
    const episodes = weekly(1, "2020-01-01", 24);

    const placement = placeInShow(
      subject({
        startDate: "2020-01-01",
        episodes: 12
      }),
      show(episodes, {
        prequelEnd: {
          seasonNumber: 1,
          episodeNumber: 12
        }
      })
    );

    expect(range(placement)?.[0]).toBe("1:S1E13");
  });

  test("numbers a continuation from the entry's first episode even when dates are far off", () => {
    const placement = placeInShow(
      subject({
        startDate: "2020-01-01",
        episodes: 12
      }),
      show(weekly(1, "2019-01-01", 24), {
        prequelEnd: {
          seasonNumber: 1,
          episodeNumber: 12
        }
      })
    );

    expect(range(placement)?.[0]).toBe("1:S1E13");
  });

  test("offsets episodes when AniList counts an episode 0 that TMDB files as a special", () => {
    // Mushoku Tensei season 2: AniList starts a week before TMDB's S2E1.
    const episodes = [
      special(1, "2023-07-03", 24),
      ...weekly(2, "2023-07-10", 12)
    ];

    const placement = placeInShow(
      subject({
        startDate: "2023-07-03",
        endDate: "2023-09-25",
        episodes: 13
      }),
      show(episodes)
    );

    expect(range(placement)?.slice(0, 2)).toEqual([
      "1:S0E1",
      "2:S2E1"
    ]);
    expect(range(placement)?.at(-1)).toBe("13:S2E12");
  });

  test("continues into specials released after the broadcast run", () => {
    // Bakemonogatari: 12 broadcast episodes, the last 3 released online later.
    const episodes = [
      special(1, "2009-08-07", 24),
      special(2, "2009-11-03", 24),
      special(3, "2010-02-23", 24),
      special(4, "2010-06-25", 24),
      ...weekly(1, "2009-07-03", 12)
    ];

    const placement = placeInShow(
      subject({
        startDate: "2009-07-03",
        endDate: "2010-06-25",
        episodes: 15
      }),
      show(episodes)
    );

    expect(range(placement)?.slice(11)).toEqual([
      "12:S1E12",
      "13:S0E2",
      "14:S0E3",
      "15:S0E4"
    ]);
  });

  test("skips interleaved extras of a different length among specials", () => {
    // Attack on Titan's OVA shares season 0 with short chibi episodes.
    const episodes = [
      special(7, "2013-12-09", 24),
      special(8, "2013-12-18", 13),
      special(9, "2014-01-15", 14),
      special(10, "2014-02-19", 10),
      special(13, "2014-04-09", 25),
      special(14, "2014-08-08", 24)
    ];

    const placement = placeInShow(
      subject({
        format: "OVA",
        startDate: "2013-12-09",
        endDate: "2014-08-08",
        episodes: 3,
        durationMinutes: 25
      }),
      show(episodes)
    );

    expect(range(placement)).toEqual([
      "1:S0E7",
      "2:S0E13",
      "3:S0E14"
    ]);
  });

  test("does not place shorts on regular episodes airing the same week", () => {
    // Re:Zero Break Time: three-minute shorts alongside the main broadcast.
    const episodes = [
      ...weekly(1, "2016-04-04", 25, {
        runtime: 25
      }),
      ...weekly(0, "2016-04-05", 11, {
        runtime: 3
      })
    ];

    const placement = placeInShow(
      subject({
        format: "TV_SHORT",
        startDate: "2016-04-08",
        endDate: "2016-06-21",
        episodes: 11,
        durationMinutes: 3
      }),
      show(episodes)
    );

    expect(range(placement)?.[0]).toBe("1:S0E1");
  });

  test("never places a special on a regular episode", () => {
    const episodes = weekly(1, "2003-05-01", 20);

    const placement = placeInShow(
      subject({
        format: "SPECIAL",
        startDate: "2003-05-22",
        endDate: "2003-05-22",
        episodes: 1
      }),
      show(episodes)
    );

    expect(placement).toBeNull();
  });

  test("places an OVA series that TMDB lists as a show of its own", () => {
    const placement = placeInShow(
      subject({
        format: "OVA",
        startDate: "1995-12-16",
        endDate: "1996-01-21",
        episodes: 2,
        durationMinutes: 45
      }),
      show([
        {
          ...special(1, "1995-12-16", 45),
          season_number: 1
        },
        {
          ...special(2, "1996-01-21", 45),
          season_number: 1
        }
      ])
    );

    expect(range(placement)).toEqual([
      "1:S1E1",
      "2:S1E2"
    ]);
  });

  test("does not let a prequel OVA released days earlier claim the TV premiere", () => {
    const placement = placeInShow(
      subject({
        format: "OVA",
        startDate: "2020-03-30",
        endDate: "2020-03-30",
        episodes: 1
      }),
      show(weekly(1, "2020-04-04", 12))
    );

    expect(placement).toBeNull();
  });

  test("continues an OVA series in its franchise's show", () => {
    // Gundam MS IGLOO: three OVA series, one TMDB season each.
    const placement = placeInShow(
      subject({
        format: "OVA",
        startDate: "2008-10-24",
        endDate: "2009-06-26",
        episodes: 3,
        durationMinutes: 30
      }),
      show([
        ...weekly(1, "2004-07-19", 3),
        ...weekly(2, "2006-04-26", 3),
        ...weekly(3, "2008-10-24", 3)
      ], {
        isFranchiseShow: true,
        prequelEnd: {
          seasonNumber: 2,
          episodeNumber: 3
        }
      })
    );

    expect(range(placement)?.[0]).toBe("1:S3E1");
  });

  test("falls back to name, year, and episode count when air dates disagree", () => {
    const placement = placeInShow(
      subject({
        titles: ["Le Chevalier D'Eon"],
        startDate: "2006-07-02",
        episodes: 24
      }),
      {
        ...show(weekly(1, "2006-08-19", 24)),
        show: {
          id: 1,
          name: "Le Chevalier D'Eon",
          originalName: "シュヴァリエ",
          episodes: weekly(1, "2006-08-19", 24)
        }
      }
    );

    expect(placement?.method).toBe("title");
    expect(range(placement)).toHaveLength(24);
  });

  test("prefers the franchise's own show over a same-dated duplicate", () => {
    const episodes = [special(36, "2023-03-04", 61)];
    const specialSubject = subject({
      format: "SPECIAL",
      startDate: "2023-03-04",
      endDate: "2023-03-04",
      episodes: 1,
      durationMinutes: 61
    });

    const franchise = placeInShow(specialSubject, show(episodes, {
      isFranchiseShow: true
    }));
    const duplicate = placeInShow(
      specialSubject,
      show([
        {
          ...special(1, "2023-03-04", 61),
          season_number: 1
        }
      ])
    );

    expect(franchise?.score).toBeGreaterThan(duplicate?.score ?? 0);
  });

  test("rejects a show whose episodes air far from the entry's dates", () => {
    const placement = placeInShow(
      subject({
        startDate: "2019-04-06",
        episodes: 12
      }),
      show(weekly(1, "2015-01-01", 12))
    );

    expect(placement).toBeNull();
  });
});

describe("placeAsMovie", () => {
  test("accepts a film released on the entry's start date", () => {
    const placement = placeAsMovie(
      subject({
        format: "MOVIE",
        titles: ["Demon Slayer -Kimetsu no Yaiba- The Movie: Mugen Train"],
        startDate: "2020-10-16"
      }),
      movie({
        title: "Demon Slayer -Kimetsu no Yaiba- The Movie: Mugen Train",
        release_date: "2020-10-16"
      })
    );

    expect(placement?.method).toBe("release-date");
  });

  test("rejects a bonus short named after a film released months earlier", () => {
    const placement = placeAsMovie(
      subject({
        format: "OVA",
        titles: [
          "Boku no Hero Academia THE MOVIE: World Heroes' Mission - Tabidachi",
          "My Hero Academia: World Heroes' Mission"
        ],
        primaryTitleCount: 1,
        startDate: "2022-02-16"
      }),
      movie({
        title: "My Hero Academia: World Heroes' Mission",
        release_date: "2021-08-06"
      })
    );

    expect(placement).toBeNull();
  });

  test("accepts an unreleased film only on a near-exact title", () => {
    const upcoming = subject({
      format: "MOVIE",
      titles: ["Demon Slayer: Kimetsu no Yaiba Infinity Castle Part 2"]
    });

    expect(placeAsMovie(upcoming, movie({
      title: "Demon Slayer: Kimetsu no Yaiba Infinity Castle Part 2"
    }))?.method).toBe("title");
    expect(placeAsMovie(upcoming, movie({
      title: "Demon Slayer: Kimetsu no Yaiba Infinity Castle",
      release_date: "2025-07-18"
    }))).toBeNull();
  });
});

describe("titleSimilarity", () => {
  test("ignores case, punctuation, and full-width characters", () => {
    expect(titleSimilarity("Re:ZERO -Starting Life in Another World-", "re zero starting life in another world")).toBe(1);
    expect(titleSimilarity("ＮＡＲＵＴＯ", "Naruto")).toBe(1);
  });

  test("scores unrelated titles low", () => {
    expect(titleSimilarity("Attack on Titan", "Mushoku Tensei")).toBeLessThan(0.2);
  });
});
