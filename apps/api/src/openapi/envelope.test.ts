import { describe, expect, test } from "bun:test";

import { pageMeta, snakeCased } from "./envelope";

describe("snakeCased", () => {
  test("renames fields at every depth and leaves values alone", () => {
    expect(
      snakeCased({
        posterUrl: "https://image.example/poster.jpg",
        nextEpisode: {
          seasonId: "s_1",
          airingAt: "2026-09-25T00:00:00.000Z"
        },
        seasons: [
          {
            episodeCount: 12
          }
        ],
        skipSegments: [],
        status: null
      })
    ).toEqual({
      poster_url: "https://image.example/poster.jpg",
      next_episode: {
        season_id: "s_1",
        airing_at: "2026-09-25T00:00:00.000Z"
      },
      seasons: [
        {
          episode_count: 12
        }
      ],
      skip_segments: [],
      status: null
    });
  });

  test("keeps arrays of plain values", () => {
    expect(snakeCased(["Action", "Fantasy"])).toEqual(["Action", "Fantasy"]);
  });
});

describe("pageMeta", () => {
  test("links the pages either side, keeping the query", () => {
    expect(
      pageMeta("https://api.example/v1/search?q=frieren&per_page=10&page=2", {
        page: 2,
        perPage: 10,
        hasNextPage: true,
        isPreparing: false
      })
    ).toEqual({
      page: 2,
      per_page: 10,
      has_next_page: true,
      next: "/v1/search?q=frieren&per_page=10&page=3",
      previous: "/v1/search?q=frieren&per_page=10&page=1",
      preparing: false
    });
  });

  test("has no previous page on the first, and no next on the last", () => {
    const meta = pageMeta("https://api.example/v1/anime", {
      page: 1,
      perPage: 24,
      hasNextPage: false,
      isPreparing: true
    });

    expect(meta.next).toBeNull();
    expect(meta.previous).toBeNull();
    expect(meta.preparing).toBe(true);
  });
});
