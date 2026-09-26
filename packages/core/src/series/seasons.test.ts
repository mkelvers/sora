import { describe, expect, test } from "bun:test";

import type { AnimeCard } from "../catalog/models/anime";
import type { TmdbEpisode } from "../tmdb/resources";
import type { EpisodeLink } from "./matching";
import { isLaterPart, layoutShowSeasons, extraSeasonTitle, type SeasonMember, type SeriesSeason } from "./seasons";

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

/** Describes a season's episodes as "anilistId#episode". */
function outline(season: SeriesSeason) {
  return season.episodes.map((item) => `${item.playback.anilistId}#${item.playback.episode}`);
}

describe("layoutShowSeasons", () => {
  // Tensura, reduced: two seasons, the second split into two cours, an OAD,
  // a one-off AniList special, and TMDB-only recaps in specials.
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
  const tales = member(anime(5, "Tensura Tales", {
    format: "SPECIAL",
    episodes: 1
  }), links(0, 4, 1));

  const seasons = layoutShowSeasons({
    show,
    members: [
      seasonTwoPartTwo,
      oad,
      tales,
      seasonOne,
      seasonTwo
    ]
  });

  test("merges a later part into the season it continues", () => {
    expect(seasons.filter((season) => season.kind === "season")).toHaveLength(2);
    expect(seasons[1]?.anime.map((card) => card.id)).toEqual([
      2,
      5,
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

  test("places one-off AniList specials by air date inside the regular seasons", () => {
    expect(outline(seasons[1]!)).toEqual([
      "2#1",
      "2#2",
      "5#1",
      "3#1",
      "3#2"
    ]);
  });

  test("leaves out specials only TMDB lists", () => {
    expect(outline(seasons[0]!)).toEqual([
      "1#1",
      "1#2",
      "1#3"
    ]);
  });

  test("lays out a sequel TMDB does not list yet as the next regular season", () => {
    const layout = layoutShowSeasons({
      show,
      members: [
        seasonOne,
        seasonTwo,
        seasonTwoPartTwo,
        oad,
        {
          ...member(anime(5, "Tensura Season 3", {
            episodes: 3
          }), [], [3]),
          isUnlistedSeason: true
        }
      ]
    });

    const regular = layout.filter((season) => season.kind === "season");
    expect(regular.map((season) => season.title)).toEqual([
      "Season 1",
      "Season 2",
      "Season 3"
    ]);
    expect(outline(regular[2]!)).toEqual([
      "5#1",
      "5#2",
      "5#3"
    ]);
    expect(layout.filter((season) => season.kind === "ova")).toHaveLength(1);
  });

  test("merges an unlisted later part into the unlisted season it continues", () => {
    const layout = layoutShowSeasons({
      show,
      members: [
        seasonOne,
        seasonTwo,
        seasonTwoPartTwo,
        {
          ...member(anime(5, "Tensura Season 3", {
            episodes: 2
          }), [], [3]),
          isUnlistedSeason: true
        },
        {
          ...member(anime(6, "Tensura Season 3 Part 2", {
            episodes: 2
          }), [], [5]),
          isUnlistedSeason: true
        }
      ]
    });

    expect(layout.at(-1)?.anime.map((card) => card.id)).toEqual([
      5,
      6
    ]);
    expect(layout).toHaveLength(3);
  });

  test("turns a multi-episode OVA into an OVA season", () => {
    const ova = seasons.find((season) => season.kind === "ova");
    expect(ova?.number).toBe(1);
    expect(ova?.title).toBe("OVA Season 1");
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
      ]
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
      ]
    });

    expect(layout.map((season) => season.anime.map((card) => card.id))).toEqual([
      [1],
      [
        2,
        3
      ]
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
      ]
    });

    expect(layout.map((season) => season.title)).toEqual([
      "Unwavering Resolve Arc",
      "Season 2"
    ]);
  });
});

describe("layoutShowSeasons watch order", () => {
  // Rascal Does Not Dream of Bunny Girl Senpai: two TMDB seasons with three
  // films between them and a fourth after, which TMDB lists as films of
  // their own, and picture dramas under specials.
  const show = {
    seasons: [],
    episodes: [
      episode(0, 1, "2018-12-19", "Picture Drama: Inside the Heart", 8),
      ...weekly(1, 1, 3, "2018-10-04"),
      ...weekly(2, 1, 3, "2025-07-05")
    ]
  };

  const film = (id: number, title: string, prequelId: number) =>
    ({
      ...member(anime(id, title, {
        format: "MOVIE",
        episodes: 1,
        durationMinutes: 90
      }), [], [prequelId]),
      film: {
        title,
        overview: `${title} overview`,
        release_date: "2019-06-15",
        runtime: 90,
        backdrop_path: null
      }
    }) satisfies SeasonMember;

  const seasonOne = member(anime(101291, "Rascal Does Not Dream of Bunny Girl Senpai", {
    episodes: 3
  }), links(1, 1, 3));
  const dreamingGirl = film(104157, "Rascal Does Not Dream of a Dreaming Girl", 101291);
  const sister = film(154967, "Rascal Does Not Dream of a Sister Venturing Out", 104157);
  const knapsack = film(161474, "Rascal Does Not Dream of a Knapsack Kid", 154967);
  const seasonTwo = member(anime(171046, "Rascal Does Not Dream of Santa Claus", {
    episodes: 3
  }), links(2, 1, 3), [161474]);
  const dearFriend = film(199340, "Rascal Does Not Dream of a Dear Friend", 171046);

  const seasons = layoutShowSeasons({
    show,
    members: [
      dearFriend,
      seasonTwo,
      knapsack,
      seasonOne,
      sister,
      dreamingGirl
    ]
  });

  test("places films between the seasons they follow", () => {
    expect(seasons.map((season) => `${season.kind} ${season.number}: ${season.title}`)).toEqual([
      "season 1: Season 1",
      "movie 1: Rascal Does Not Dream of a Dreaming Girl",
      "movie 2: Rascal Does Not Dream of a Sister Venturing Out",
      "movie 3: Rascal Does Not Dream of a Knapsack Kid",
      "season 2: Season 2",
      "movie 4: Rascal Does Not Dream of a Dear Friend"
    ]);
    expect(seasons.every((season) => season.inWatchOrder)).toBe(true);
  });

  test("describes a film with TMDB's details of it", () => {
    expect(seasons[1]?.episodes).toEqual([
      expect.objectContaining({
        number: 1,
        title: "Rascal Does Not Dream of a Dreaming Girl",
        overview: "Rascal Does Not Dream of a Dreaming Girl overview",
        runtimeMinutes: 90,
        playback: {
          anilistId: 104157,
          episode: 1
        },
        tmdb: null
      })
    ]);
  });

  // Haikyu!!, reduced: an OVA continues season 3 into season 4, a recap
  // special summarises season 3, and a side-story OVA stands apart.
  const haikyu = {
    seasons: [],
    episodes: [
      episode(0, 1, "2015-03-04", "Lev Appears!"),
      episode(0, 2, "2017-08-04", "Special Feature! The Spring Tournament of Their Youth"),
      episode(0, 3, "2020-01-22", "Land vs. Air"),
      episode(0, 4, "2020-01-22", "The Path of the Ball"),
      episode(0, 5, "2020-03-04", "Puppet 1"),
      episode(0, 6, "2020-03-11", "Puppet 2"),
      ...weekly(3, 1, 2, "2016-10-08"),
      ...weekly(4, 1, 2, "2020-01-11")
    ]
  };
  const seasonThree = member(anime(21698, "HAIKYU!!", {
    episodes: 2
  }), links(3, 1, 2));
  const landVsAir = member(anime(111790, "HAIKYU!! LAND VS. AIR", {
    format: "OVA",
    episodes: 2
  }), links(0, 3, 2), [21698]);
  const toTheTop = member(anime(106625, "HAIKYU!! TO THE TOP", {
    episodes: 2
  }), links(4, 1, 2), [111790]);
  const recap = {
    ...member(anime(107351, "HAIKYU!! Special Feature! The Spring Tournament of Their Youth", {
      format: "OVA",
      episodes: 1
    }), links(0, 2, 1)),
    isRecap: true
  };
  const puppets = member(anime(115217, "Haikyuu!! Ningyou Anime", {
    format: "OVA",
    episodes: 2
  }), links(0, 5, 2));
  const dumpsterBattle = film(153658, "HAIKYU!! The Dumpster Battle", 106625);

  const haikyuSeasons = layoutShowSeasons({
    show: haikyu,
    members: [
      puppets,
      recap,
      toTheTop,
      dumpsterBattle,
      landVsAir,
      seasonThree
    ]
  });

  test("places an OVA that continues the story in watch order", () => {
    expect(haikyuSeasons.map((season) => `${season.kind} ${season.number}: ${season.title} ${season.inWatchOrder}`)).toEqual([
      "season 1: Season 1 true",
      "ova 1: LAND VS. AIR true",
      "season 2: Season 2 true",
      "movie 1: The Dumpster Battle true",
      "ova 2: Special Feature! The Spring Tournament of Their Youth false",
      "ova 3: Haikyuu!! Ningyou Anime false"
    ]);
    expect(outline(haikyuSeasons[1]!)).toEqual([
      "111790#1",
      "111790#2"
    ]);
  });

  test("keeps recaps out of the seasons", () => {
    expect(outline(haikyuSeasons[0]!)).toEqual([
      "21698#1",
      "21698#2"
    ]);
  });

  test("keeps continuations of one season in airing order", () => {
    const later = film(104200, "Rascal Does Not Dream of a Second Film", 101291);
    const layout = layoutShowSeasons({
      show,
      members: [
        seasonOne,
        later,
        dreamingGirl,
        sister
      ]
    });

    expect(layout.map((season) => season.anime[0]?.id)).toEqual([
      101291,
      104157,
      154967,
      104200
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

describe("extraSeasonTitle", () => {
  const show = anime(1, "That Time I Got Reincarnated as a Slime", {
    title: {
      display: "That Time I Got Reincarnated as a Slime",
      english: "That Time I Got Reincarnated as a Slime",
      romaji: "Tensei Shitara Slime Datta Ken",
      native: null
    }
  });

  test("keeps what sets the OVA apart from its show", () => {
    expect(extraSeasonTitle({ anime: anime(2, "That Time I Got Reincarnated as a Slime: Visions of Coleus") }, show, "ova", 2)).toBe("Visions of Coleus");
  });

  test("numbers an OVA whose title adds nothing distinctive", () => {
    expect(extraSeasonTitle({ anime: anime(3, "That Time I Got Reincarnated as a Slime OAD") }, show, "ova", 1)).toBe("OVA Season 1");
  });

  test("matches the show by any of its titles", () => {
    const romajiOnly = anime(4, "Tensei Shitara Slime Datta Ken: Kanwa", {
      title: {
        display: "Tensei Shitara Slime Datta Ken: Kanwa",
        english: null,
        romaji: "Tensei Shitara Slime Datta Ken: Kanwa",
        native: null
      }
    });
    expect(extraSeasonTitle({ anime: romajiOnly }, show, "ova", 3)).toBe("Kanwa");
  });

  test("prefers TMDB's title of a film", () => {
    const film = {
      anime: anime(6, "Tensei Shitara Slime Datta Ken Movie: Guren no Kizuna-hen"),
      film: {
        title: "That Time I Got Reincarnated as a Slime the Movie: Scarlet Bond",
        overview: null,
        release_date: null,
        runtime: null,
        backdrop_path: null
      }
    };
    expect(extraSeasonTitle(film, show, "movie", 1)).toBe("Scarlet Bond");
  });

  test("ignores punctuation in the show's title", () => {
    const demonSlayer = anime(7, "Demon Slayer: Kimetsu no Yaiba");
    const mugenTrain = anime(8, "Demon Slayer -Kimetsu no Yaiba- The Movie: Mugen Train", {
      format: "MOVIE"
    });
    expect(extraSeasonTitle({ anime: mugenTrain }, demonSlayer, "movie", 1)).toBe("Mugen Train");
  });

  test("keeps a film's full title when the show's leaves nothing distinctive", () => {
    const violet = anime(9, "Violet Evergarden");
    expect(extraSeasonTitle({ anime: anime(10, "Violet Evergarden: the Movie") }, violet, "movie", 2)).toBe("Violet Evergarden: the Movie");
  });

  test("keeps the title of an OVA named differently from its show", () => {
    expect(extraSeasonTitle({ anime: anime(5, "Rimuru's Holiday") }, show, "ova", 1)).toBe("Rimuru's Holiday");
  });
});
