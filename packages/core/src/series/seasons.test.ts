import { describe, expect, test } from "bun:test";

import type { AnimeCard } from "../catalog/models/anime";
import type { TmdbEpisode } from "../tmdb/resources";
import type { EpisodeLink } from "./matching";
import { isLaterPart, layoutShowSeasons, type SeasonMember, type SeriesSeason } from "./seasons";

function anime(id: number, title: string, overrides: Partial<AnimeCard> = {}): AnimeCard {
  return {
    id,
    malId: null,
    title: {
      display: title,
      english: title,
      romaji: null,
      native: null
    },
    coverUrl: null,
    coverColor: null,
    bannerUrl: null,
    format: "TV",
    status: "FINISHED",
    season: null,
    seasonYear: null,
    episodes: null,
    durationMinutes: 24,
    score: null,
    popularity: null,
    genres: [],
    nextEpisode: null,
    isAdult: false,
    ...overrides
  };
}

function episode(season: number, number: number, airDate: string, name: string, runtime = 24): TmdbEpisode {
  return {
    season_number: season,
    episode_number: number,
    name,
    overview: null,
    air_date: airDate,
    runtime,
    still_path: null
  };
}

/** A weekly run of TMDB episodes from `first`. */
function weekly(season: number, first: number, count: number, start: string): TmdbEpisode[] {
  return Array.from({ length: count }, (_, index) =>
    episode(
      season,
      first + index,
      new Date(Date.parse(`${start}T00:00:00Z`) + index * 7 * 86_400_000).toISOString().slice(0, 10),
      `S${season}E${first + index}`
    )
  );
}

/** Links AniList episodes 1..n to consecutive TMDB episodes. */
function links(season: number, firstEpisode: number, count: number): EpisodeLink[] {
  return Array.from({ length: count }, (_, index) => ({
    anilistEpisode: index + 1,
    seasonNumber: season,
    episodeNumber: firstEpisode + index
  }));
}

function member(card: AnimeCard, episodeLinks: EpisodeLink[], prequelIds: number[] = []): SeasonMember {
  return {
    anime: card,
    prequelIds,
    links: episodeLinks
  };
}

/** Describes a season as "title: episode, episode, …" using TMDB names or AniList positions. */
function outline(season: SeriesSeason) {
  return season.episodes.map((item) =>
    item.playback ? `${item.playback.anilistId}#${item.playback.episode}` : `extra:${item.title}`
  );
}

describe("layoutShowSeasons", () => {
  // Tensura, reduced: two seasons, the second split into two cours, an OAD,
  // and TMDB-only recaps in specials.
  const show = {
    seasons: [],
    episodes: [
      episode(0, 1, "2019-03-26", "Veldora's Journal"),
      episode(0, 2, "2019-07-09", "Extra: The Tragedy of M?"),
      episode(0, 3, "2019-12-04", "Extra: Hey! Butts!"),
      episode(0, 4, "2021-06-29", "Tales: Veldora's Journal 2"),
      ...weekly(1, 1, 3, "2019-01-01"),
      ...weekly(2, 1, 2, "2021-01-12"),
      ...weekly(2, 3, 2, "2021-07-06")
    ]
  };

  const seasonOne = member(anime(1, "Tensura", {
    episodes: 3
  }), links(1, 1, 3));
  const seasonTwo = member(anime(2, "Tensura Season 2", {
    episodes: 2
  }), links(2, 1, 2), [1]);
  const seasonTwoPartTwo = member(anime(3, "Tensura Season 2 Part 2", {
    episodes: 2
  }), links(2, 3, 2), [2]);
  const oad = member(anime(4, "Tensura OAD", {
    format: "OVA",
    episodes: 2
  }), links(0, 2, 2));

  const seasons = layoutShowSeasons({
    show,
    members: [
      seasonTwoPartTwo,
      oad,
      seasonOne,
      seasonTwo
    ],
    claimedSpecials: []
  });

  test("merges a later part into the season it continues", () => {
    expect(seasons.filter((season) => season.kind === "season")).toHaveLength(2);
    expect(seasons[1]?.anime.map((card) => card.id)).toEqual([
      2,
      3
    ]);
  });

  test("numbers episodes from 1 in every season", () => {
    expect(seasons[1]?.episodes.map((item) => item.number)).toEqual([
      1,
      2,
      3,
      4,
      5
    ]);
  });

  test("places TMDB-only extras by air date inside the regular seasons", () => {
    expect(outline(seasons[0]!)).toEqual([
      "1#1",
      "1#2",
      "1#3",
      "extra:Veldora's Journal"
    ]);
    expect(outline(seasons[1]!)).toEqual([
      "2#1",
      "2#2",
      "extra:Tales: Veldora's Journal 2",
      "3#1",
      "3#2"
    ]);
  });

  test("turns a multi-episode OVA into an OVA season", () => {
    const ova = seasons.find((season) => season.kind === "ova");
    expect(ova?.number).toBe(1);
    expect(ova?.title).toBe("Tensura OAD");
    expect(outline(ova!)).toEqual([
      "4#1",
      "4#2"
    ]);
  });

  test("keeps an episode 0 filed under specials with the season it opens", () => {
    // Mushoku Tensei season 2: AniList episode 1 is TMDB's S0E1.
    const layout = layoutShowSeasons({
      show: {
        seasons: [],
        episodes: [
          episode(0, 1, "2023-07-03", "Guardian Fitz"),
          ...weekly(1, 1, 2, "2021-01-11"),
          ...weekly(2, 1, 2, "2023-07-10")
        ]
      },
      members: [
        member(anime(20, "Mushoku Tensei Season 2", {
          episodes: 3
        }), [
          {
            anilistEpisode: 1,
            seasonNumber: 0,
            episodeNumber: 1
          },
          {
            anilistEpisode: 2,
            seasonNumber: 2,
            episodeNumber: 1
          },
          {
            anilistEpisode: 3,
            seasonNumber: 2,
            episodeNumber: 2
          }
        ], [10]),
        member(anime(10, "Mushoku Tensei", {
          episodes: 2
        }), links(1, 1, 2))
      ],
      claimedSpecials: []
    });

    expect(layout.map(outline)).toEqual([
      [
        "10#1",
        "10#2"
      ],
      [
        "20#1",
        "20#2",
        "20#3"
      ]
    ]);
  });

  test("splits a single TMDB season into one season per AniList season", () => {
    // Re:Zero keeps every season in TMDB's season 1.
    const layout = layoutShowSeasons({
      show: {
        seasons: [],
        episodes: [
          ...weekly(1, 1, 2, "2016-04-04"),
          ...weekly(1, 3, 2, "2020-07-08"),
          ...weekly(1, 5, 2, "2021-01-06")
        ]
      },
      members: [
        member(anime(1, "Re:ZERO", {
          episodes: 2
        }), links(1, 1, 2)),
        member(anime(2, "Re:ZERO Season 2", {
          episodes: 2
        }), links(1, 3, 2), [1]),
        member(anime(3, "Re:ZERO Season 2 Part 2", {
          episodes: 2
        }), links(1, 5, 2), [2])
      ],
      claimedSpecials: []
    });

    expect(layout.map((season) => season.anime.map((card) => card.id))).toEqual([
      [1],
      [
        2,
        3
      ]
    ]);
  });

  test("leaves out extras claimed elsewhere or far from episode length", () => {
    const layout = layoutShowSeasons({
      show: {
        seasons: [],
        episodes: [
          episode(0, 1, "2019-02-01", "Chibi short", 3),
          episode(0, 2, "2019-02-02", "Omnibus", 50),
          episode(0, 3, "2019-02-03", "Claimed by a spin-off"),
          ...weekly(1, 1, 2, "2019-01-01")
        ]
      },
      members: [member(anime(1, "Show", {
        episodes: 2
      }), links(1, 1, 2))],
      claimedSpecials: [
        {
          anilistEpisode: 1,
          seasonNumber: 0,
          episodeNumber: 3
        }
      ]
    });

    expect(outline(layout[0]!)).toEqual([
      "1#1",
      "1#2"
    ]);
  });

  test("leaves out specials duplicating an outside entry by name or air date", () => {
    const layout = layoutShowSeasons({
      show: {
        seasons: [],
        episodes: [
          episode(0, 1, "2019-05-18", "Zoku Owarimonogatari: Koyomi Reverse (1)"),
          episode(0, 2, "2019-03-01", "Spin-off premiere"),
          episode(0, 3, "2019-04-01", "Recap"),
          ...weekly(1, 1, 2, "2019-01-01")
        ]
      },
      members: [member(anime(1, "Owarimonogatari", {
        episodes: 2
      }), links(1, 1, 2))],
      claimedSpecials: [],
      outsideEntries: [
        {
          titles: ["Zoku Owarimonogatari"],
          startDate: "2018-11-10",
          endDate: "2018-11-10",
          episodes: 6
        },
        {
          titles: ["Spin-off"],
          startDate: "2019-03-01",
          endDate: "2019-03-01",
          episodes: 1
        }
      ]
    });

    expect(outline(layout[0]!)).toEqual([
      "1#1",
      "1#2",
      "extra:Recap"
    ]);
  });

  test("claims specials named after the end of an outside entry's title, with same-day episodes", () => {
    const layout = layoutShowSeasons({
      show: {
        seasons: [],
        episodes: [
          episode(0, 1, "2020-01-22", "Land vs. Air"),
          episode(0, 2, "2020-01-22", "The Path of the Ball"),
          episode(0, 3, "2020-02-01", "Recap"),
          ...weekly(1, 1, 2, "2020-01-11")
        ]
      },
      members: [member(anime(1, "HAIKYU!! TO THE TOP", {
        episodes: 2
      }), links(1, 1, 2))],
      claimedSpecials: [],
      outsideEntries: [
        {
          titles: ["HAIKYU!! LAND VS. AIR"],
          startDate: "2020-01-10",
          endDate: "2020-01-10",
          episodes: 2
        }
      ]
    });

    expect(outline(layout[0]!)).toEqual([
      "1#1",
      "1#2",
      "extra:Recap"
    ]);
  });

  test("uses TMDB's season names when seasons follow TMDB", () => {
    const layout = layoutShowSeasons({
      show: {
        seasons: [
          {
            seasonNumber: 1,
            name: "Unwavering Resolve Arc",
            posterPath: null
          },
          {
            seasonNumber: 2,
            name: "Season 2",
            posterPath: null
          }
        ],
        episodes: [
          ...weekly(1, 1, 1, "2019-04-06"),
          ...weekly(2, 1, 1, "2021-10-10")
        ]
      },
      members: [
        member(anime(1, "Demon Slayer", {
          episodes: 1
        }), links(1, 1, 1)),
        member(anime(2, "Demon Slayer Mugen Train Arc", {
          episodes: 1
        }), links(2, 1, 1), [1])
      ],
      claimedSpecials: []
    });

    expect(layout.map((season) => season.title)).toEqual([
      "Unwavering Resolve Arc",
      "Season 2"
    ]);
  });
});

describe("isLaterPart", () => {
  test("recognises part and cour numbering", () => {
    for (const title of [
      "That Time I Got Reincarnated as a Slime Season 2 Part 2",
      "Mushoku Tensei: Jobless Reincarnation Cour 2",
      "Spy x Family Part 2",
      "Kimetsu no Yaiba 2nd Cour",
      "86 Part II"
    ]) {
      expect(isLaterPart(anime(1, title))).toBe(true);
    }
  });

  test("ignores first parts and unnumbered titles", () => {
    for (const title of [
      "Attack on Titan Final Season",
      "JoJo Part 1",
      "Re:ZERO Season 3"
    ]) {
      expect(isLaterPart(anime(1, title))).toBe(false);
    }
  });
});
