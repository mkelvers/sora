import { describe, expect, mock, test } from "bun:test";

import type { Anime } from "../../catalog/models/anime";

mock.module("../../database/client", () => ({
  db: {}
}));

const { bestIdMatch, parseCatalogSeries, strictTitle } = await import("./anikoto-catalog");

/** Frieren as AniKoto's catalogue listing sends it. */
const frieren = {
  id: 6351,
  title: "Frieren: Beyond Journey's End",
  alternative: "Sousou no Frieren",
  titles: "Frieren: Beyond Journey's End",
  native: "葬送のフリーレン",
  ani_id: "154587",
  mal_id: "52991",
  year: 2023,
  episodes: "28",
  terms_by_type: {
    type: ["TV"]
  },
  updated_at: "2024-10-18 09:15:13"
};

/** An AniList entry with what matching reads; the rest is left out. */
function anime(fields: Partial<Anime> & Pick<Anime, "id" | "malId" | "format">): Anime {
  return {
    title: {
      display: "",
      english: null,
      romaji: null,
      native: null
    },
    synonyms: [],
    episodes: null,
    seasonYear: null,
    startDate: null,
    status: "FINISHED",
    relations: [],
    ...fields
  } as Anime;
}

/** A stored AniKoto series, as the mirror holds it. */
function series(fields: Partial<NonNullable<ReturnType<typeof parseCatalogSeries>>> & { anikotoId: number; title: string }) {
  return {
    anilistId: null,
    malId: null,
    titles: [fields.title],
    format: null,
    year: null,
    episodes: null,
    updatedAt: new Date(0),
    ...fields
  };
}

describe("parseCatalogSeries", () => {
  test("reads IDs, format, and every title", () => {
    expect(parseCatalogSeries(frieren)).toEqual({
      anikotoId: 6351,
      anilistId: 154587,
      malId: 52991,
      title: "Frieren: Beyond Journey's End",
      titles: ["Frieren: Beyond Journey's End", "Sousou no Frieren", "葬送のフリーレン"],
      format: "TV",
      year: 2023,
      episodes: 28,
      updatedAt: new Date("2024-10-18T09:15:13Z")
    });
  });

  test("reads AniKoto's empty strings as unknown", () => {
    expect(
      parseCatalogSeries({
        ...frieren,
        ani_id: "",
        episodes: "",
        year: null
      })
    ).toMatchObject({
      anilistId: null,
      episodes: null,
      year: null
    });
  });

  test("maps AniKoto's types to AniList formats", () => {
    const format = (type: string) =>
      parseCatalogSeries({
        ...frieren,
        terms_by_type: {
          type: [type]
        }
      })?.format;

    expect(format("Movie")).toBe("MOVIE");
    expect(format("TV Special")).toBe("SPECIAL");
    expect(format("TV_SHORT")).toBe("TV_SHORT");
    expect(format("Something new")).toBeNull();
  });

  test("keeps a title with a comma whole as well as split", () => {
    const titles = parseCatalogSeries({
      ...frieren,
      titles: "Katainaka no Ossan, Kensei ni Naru, 片田舎のおっさん、剣聖になる"
    })?.titles;

    expect(titles).toContain("Katainaka no Ossan, Kensei ni Naru, 片田舎のおっさん、剣聖になる");
    expect(titles).toContain("Katainaka no Ossan");
    expect(titles).toContain("片田舎のおっさん、剣聖になる");
  });

  test("rejects a series without a title or change date", () => {
    expect(
      parseCatalogSeries({
        ...frieren,
        title: ""
      })
    ).toBeNull();
    expect(
      parseCatalogSeries({
        ...frieren,
        updated_at: "yesterday"
      })
    ).toBeNull();
  });
});

describe("bestIdMatch", () => {
  test("passes over a film that carries its show's IDs, as for Demon Slayer", () => {
    // AniKoto files Sibling's Bond, a compilation film, under the show's
    // AniList and MyAnimeList IDs; the show itself has only the latter.
    const show = series({
      anikotoId: 1551,
      title: "Demon Slayer: Kimetsu no Yaiba",
      titles: ["Demon Slayer: Kimetsu no Yaiba", "Kimetsu no Yaiba"],
      malId: 38000,
      format: "TV",
      year: 2019,
      episodes: 26
    });
    const film = series({
      anikotoId: 6780,
      title: "Demon Slayer: Sibling's Bond",
      titles: ["Demon Slayer: Sibling's Bond", "Kimetsu no Yaiba Kyōdai no Kizuna"],
      anilistId: 101922,
      malId: 38000,
      format: "MOVIE",
      year: 2019
    });

    expect(
      bestIdMatch(
        anime({
          id: 101922,
          malId: 38000,
          format: "TV",
          episodes: 26,
          seasonYear: 2019,
          title: {
            display: "Demon Slayer: Kimetsu no Yaiba",
            english: "Demon Slayer: Kimetsu no Yaiba",
            romaji: "Kimetsu no Yaiba",
            native: "鬼滅の刃"
          }
        }),
        [film, show]
      )?.anikotoId
    ).toBe(1551);
  });

  test("trusts a matching MyAnimeList ID over AniKoto's wrong AniList ID, as for DAN DA DAN", () => {
    const dandadan = series({
      anikotoId: 4,
      title: "Dandadan",
      anilistId: 132029,
      malId: 57334,
      format: "TV",
      year: 2024,
      episodes: 12
    });

    expect(
      bestIdMatch(
        anime({
          id: 171018,
          malId: 57334,
          format: "TV",
          episodes: 12,
          seasonYear: 2024
        }),
        [dandadan]
      )?.anikotoId
    ).toBe(4);
  });

  test("prefers the broadcast cut to an uncensored copy", () => {
    const shared = {
      malId: 51705,
      format: "TV",
      year: 2023,
      episodes: 12
    };

    expect(
      bestIdMatch(
        anime({
          id: 153930,
          malId: 51705,
          format: "TV",
          episodes: 12,
          seasonYear: 2023
        }),
        [
          series({
            anikotoId: 6593,
            title: "Love Flops (Uncensored)",
            ...shared
          }),
          series({
            anikotoId: 7144,
            title: "Love Flops",
            ...shared
          })
        ]
      )?.anikotoId
    ).toBe(7144);
  });

  test("never matches a film to a show", () => {
    expect(
      bestIdMatch(
        anime({
          id: 195200,
          malId: 62546,
          format: "MOVIE"
        }),
        [
          series({
            anikotoId: 1,
            title: "Demon Slayer: Kimetsu no Yaiba",
            malId: 62546,
            format: "TV"
          })
        ]
      )
    ).toBeNull();
  });

  test("accepts a web series AniKoto lists as TV", () => {
    expect(
      bestIdMatch(
        anime({
          id: 177709,
          malId: 58939,
          format: "ONA"
        }),
        [
          series({
            anikotoId: 7498,
            title: "Sakamoto Days",
            malId: 58939,
            format: "TV"
          })
        ]
      )?.anikotoId
    ).toBe(7498);
  });
});

describe("strictTitle", () => {
  test("keeps season numbers, so a sequel never equals its first season", () => {
    expect(strictTitle("Katainaka no Ossan, Kensei ni Naru II")).not.toBe(strictTitle("Katainaka no Ossan, Kensei ni Naru"));
    expect(strictTitle("Grand Blue Season 4")).not.toBe(strictTitle("Grand Blue Season 2"));
  });

  test("ignores case, punctuation, and accents", () => {
    expect(strictTitle("Re:ZERO -Starting Life-")).toBe("re zero starting life");
    expect(strictTitle("Pokémon")).toBe(strictTitle("Pokemon"));
  });
});
