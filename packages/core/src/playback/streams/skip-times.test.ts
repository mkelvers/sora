import { afterAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import type { ContentLanguage } from "anime-sdk";

import type { ProviderUnit } from "../episodes/episodes";
import type { AniKotoSkipSpan } from "../providers/anikoto";

// Frieren season 1, episode 3: AniList 154587, MyAnimeList 52991.
let malId: number | null = 52991;
let aniKotoUnits: ProviderUnit[] = [];
let aniKotoSpans: () => Promise<AniKotoSkipSpan[]> = async () => [];

const locateEpisode = mock(async () => ({
  anilistId: 154587,
  anilistEpisode: 3
}));
const resolveSkipSpans = mock((_unitId: string, _language: ContentLanguage) => aniKotoSpans());

mock.module("../../series/episodes", () => ({
  locateEpisode
}));
mock.module("../../catalog/queries/anime", () => ({
  getAnime: async (id: number) => ({
    id,
    malId
  })
}));
mock.module("../episodes/episodes", () => ({
  getProviderUnits: async () => aniKotoUnits
}));
mock.module("../providers/registry", () => ({
  aniKotoProvider: {
    id: "anikoto",
    resolveSkipSpans
  }
}));

const { getSkipTimes } = await import("./skip-times");

/** AniSkip's answer for Frieren episode 3, as captured from the live API. */
const aniSkipFound = {
  found: true,
  results: [
    {
      interval: {
        startTime: 1367,
        endTime: 1459
      },
      skipType: "ed",
      skipId: "f6f905e7-826e-4be8-b67e-b0c78cb499ac",
      episodeLength: 1471
    },
    {
      interval: {
        startTime: 1.35,
        endTime: 91.35
      },
      skipType: "op",
      skipId: "9a85542c-c602-4904-802b-ff3f71c368be",
      episodeLength: 1469.979
    }
  ],
  message: "Successfully found skip times",
  statusCode: 200
};

const aniSkipNotFound = {
  found: false,
  results: [],
  message: "No skip times found",
  statusCode: 404
};

const unit = (languages: ContentLanguage[] | null): ProviderUnit => ({
  id: "anikoto:107260",
  number: 3,
  title: "Killing Magic",
  languages,
  isFiller: false
});

const { preconnect } = globalThis.fetch;
const fetchSpy = spyOn(globalThis, "fetch");

/** Answers every `fetch` with `respond`; Bun's `fetch` type also carries `preconnect`. */
const serveFetch = (respond: () => Promise<Response>) =>
  fetchSpy.mockImplementation(
    Object.assign(respond, {
      preconnect
    })
  );
const answerAniSkip = (body: object, status = 200) => serveFetch(async () => Response.json(body, { status }));

beforeEach(() => {
  malId = 52991;
  aniKotoUnits = [];
  aniKotoSpans = async () => [];
  resolveSkipSpans.mockClear();
  fetchSpy.mockReset();
  answerAniSkip(aniSkipNotFound, 404);
});

afterAll(() => {
  fetchSpy.mockRestore();
  mock.restore();
});

describe("getSkipTimes", () => {
  test("uses AniKoto's segments and does not ask AniSkip", async () => {
    aniKotoUnits = [unit(["sub", "dub"])];
    aniKotoSpans = async () => [
      {
        kind: "opening",
        start: 0,
        end: 89
      },
      {
        kind: "ending",
        start: 1370,
        end: 1459
      }
    ];
    answerAniSkip(aniSkipFound);

    expect(await getSkipTimes("season", 3)).toEqual([
      {
        kind: "opening",
        mixed: false,
        start: 0,
        end: 89,
        episodeLength: null
      },
      {
        kind: "ending",
        mixed: false,
        start: 1370,
        end: 1459,
        episodeLength: null
      }
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("reads the sub embed when AniKoto lists one", async () => {
    aniKotoUnits = [unit(["dub", "sub"])];

    await getSkipTimes("season", 3);

    expect(resolveSkipSpans.mock.calls[0]?.slice(0, 2)).toEqual([
      "anikoto:107260",
      "sub"
    ]);
  });

  test("reads the dub embed when AniKoto only has a dub", async () => {
    aniKotoUnits = [unit(["dub"])];

    await getSkipTimes("season", 3);

    expect(resolveSkipSpans.mock.calls[0]?.[1]).toBe("dub");
  });

  test("reads the sub embed when AniKoto does not say which languages it has", async () => {
    aniKotoUnits = [unit(null)];

    await getSkipTimes("season", 3);

    expect(resolveSkipSpans.mock.calls[0]?.[1]).toBe("sub");
  });

  test("falls back to AniSkip when AniKoto has no segments for the episode", async () => {
    aniKotoUnits = [unit(["sub"])];
    answerAniSkip(aniSkipFound);

    expect(await getSkipTimes("season", 3)).toEqual([
      {
        kind: "opening",
        mixed: false,
        start: 1.35,
        end: 91.35,
        episodeLength: 1469.979
      },
      {
        kind: "ending",
        mixed: false,
        start: 1367,
        end: 1459,
        episodeLength: 1471
      }
    ]);
    expect(resolveSkipSpans).toHaveBeenCalledTimes(1);
  });

  test("falls back to AniSkip when AniKoto does not list the episode", async () => {
    aniKotoUnits = [
      {
        ...unit(["sub"]),
        number: 4
      }
    ];
    answerAniSkip(aniSkipFound);

    expect(await getSkipTimes("season", 3)).toHaveLength(2);
    expect(resolveSkipSpans).not.toHaveBeenCalled();
  });

  test("falls back to AniSkip when AniKoto fails", async () => {
    aniKotoUnits = [unit(["sub"])];
    aniKotoSpans = async () => {
      throw new Error("MegaPlay embed page has no file ID");
    };
    answerAniSkip(aniSkipFound);

    expect(await getSkipTimes("season", 3)).toHaveLength(2);
  });

  test("asks AniSkip for the AniList episode, every segment type, and the stream's rounded duration", async () => {
    await getSkipTimes("season", 3, 1469.6);

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://api.aniskip.com/v2/skip-times/52991/3");
    expect(url.searchParams.getAll("types[]")).toEqual([
      "op",
      "ed",
      "mixed-op",
      "mixed-ed",
      "recap"
    ]);
    expect(url.searchParams.get("episodeLength")).toBe("1470");
  });

  test("maps AniSkip's mixed and recap segments", async () => {
    answerAniSkip({
      found: true,
      results: [
        {
          interval: {
            startTime: 0,
            endTime: 60
          },
          skipType: "recap",
          episodeLength: 1440
        },
        {
          interval: {
            startTime: 60,
            endTime: 150
          },
          skipType: "mixed-op",
          episodeLength: 1440
        },
        {
          interval: {
            startTime: 1300,
            endTime: 1390
          },
          skipType: "mixed-ed",
          episodeLength: 1440
        }
      ]
    });

    expect((await getSkipTimes("season", 3)).map(({ kind, mixed }) => [kind, mixed])).toEqual([
      ["recap", false],
      ["opening", true],
      ["ending", true]
    ]);
  });

  test("drops AniSkip segments that end before they start", async () => {
    answerAniSkip({
      found: true,
      results: [
        {
          interval: {
            startTime: 90,
            endTime: 10
          },
          skipType: "op",
          episodeLength: 1440
        }
      ]
    });

    expect(await getSkipTimes("season", 3)).toEqual([]);
  });

  test("returns nothing when neither source knows the episode", async () => {
    aniKotoUnits = [unit(["sub"])];

    expect(await getSkipTimes("season", 3)).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("returns nothing without asking AniSkip when the anime has no MyAnimeList ID", async () => {
    malId = null;

    expect(await getSkipTimes("season", 3)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("returns nothing when AniSkip fails or answers malformed", async () => {
    serveFetch(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await getSkipTimes("season", 3)).toEqual([]);

    answerAniSkip({
      unexpected: true
    });
    expect(await getSkipTimes("season", 3)).toEqual([]);
  });

  test("propagates a missing season or episode instead of returning nothing", async () => {
    locateEpisode.mockImplementationOnce(async () => {
      throw new Error("Season not found");
    });

    await expect(getSkipTimes("missing", 3)).rejects.toThrow("Season not found");
  });
});
