import { describe, expect, test } from "bun:test";

import { parseTmdbHints } from "./hints";

describe("parseTmdbHints", () => {
  test("reads the show and films hinted for each AniList entry", () => {
    const hints = parseTmdbHints([
      {
        type: "TV",
        anidb_id: 17617,
        anilist_id: 154587,
        mal_id: 52991,
        themoviedb_id: {
          tv: 209867,
        },
        season: {
          tvdb: 1,
          tmdb: 1,
        },
      },
      {
        type: "MOVIE",
        anidb_id: 7,
        anilist_id: 164,
        themoviedb_id: {
          movie: [128],
        },
      }
    ]);

    expect([...hints]).toEqual([
      [154587, {
        showId: 209867,
        movieIds: [],
      }],
      [164, {
        showId: null,
        movieIds: [128],
      }]
    ]);
  });

  test("skips entries without an AniList ID or TMDB IDs, and malformed ones", () => {
    const hints = parseTmdbHints([
      {
        anidb_id: 1,
        themoviedb_id: {
          tv: 26209,
        },
      },
      {
        anilist_id: 290,
      },
      {
        anilist_id: 291,
        themoviedb_id: {},
      },
      {
        anilist_id: "292",
        themoviedb_id: {
          tv: 1,
        },
      },
      {
        anilist_id: 293,
        themoviedb_id: {
          tv: "movie",
        },
      },
      null
    ]);

    expect(hints.size).toBe(0);
  });

  test("merges entries that share an AniList ID", () => {
    const hints = parseTmdbHints([
      {
        anilist_id: 1,
        themoviedb_id: {
          tv: 10,
          movie: [20],
        },
      },
      {
        anilist_id: 1,
        themoviedb_id: {
          tv: 11,
          movie: [20, 21],
        },
      }
    ]);

    expect(hints.get(1)).toEqual({
      showId: 10,
      movieIds: [20, 21],
    });
  });

  test("rejects a list that is not an array", () => {
    expect(() => parseTmdbHints({
      entries: [],
    })).toThrow(TypeError);
  });
});
