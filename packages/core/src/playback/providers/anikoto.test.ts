import { describe, expect, test } from "bun:test";

import { HttpClient } from "anime-sdk";

import { AniKotoStreamProvider } from "./anikoto";

const embedPage = "<html><head><title>File 23417 - MegaPlay</title></head></html>";
const errorPage = "<html><head><title>Error - MegaPlay</title></head></html>";

/** `getSources` as MegaPlay sends it, with the source unencrypted. */
function sources(intro: object | undefined, outro: object | undefined) {
  return JSON.stringify({
    sources: {
      file: "https://cdn.example/master.m3u8"
    },
    tracks: [],
    t: 1,
    intro,
    outro,
    server: 4
  });
}

/**
 * A provider whose HTTP requests are answered by `pages`, keyed by path, and
 * the URLs it requested.
 */
function providerServing(pages: Record<string, string>) {
  const requested: string[] = [];
  const http = new HttpClient({
    retry: false,
    transport: {
      fetch: async (url) => {
        requested.push(url);
        const page = pages[new URL(url).pathname];
        return page === undefined ? new Response("Not found", { status: 404 }) : new Response(page);
      }
    }
  });

  return {
    provider: new AniKotoStreamProvider(http, {
      locale: "en",
      listsLanguages: true
    }),
    requested
  };
}

/** The skip segments shipped with the stream `provider` resolves. */
async function skipSegments(provider: AniKotoStreamProvider, episodeId: string, language: "sub" | "dub") {
  return (await provider.resolveStream(episodeId, language)).skipSegments;
}

describe("AniKotoStreamProvider skip segments", () => {
  test("reads the opening and ending, as for Frieren episode 3", async () => {
    const { provider } = providerServing({
      "/stream/s-2/107260/sub": embedPage,
      "/stream/getSources": sources(
        {
          start: 0,
          end: 89
        },
        {
          start: 1370,
          end: 1459
        }
      )
    });

    expect(await skipSegments(provider, "anikoto:107260", "sub")).toEqual([
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
    ]);
  });

  test("come with the stream, requesting only the embed and its file's sources", async () => {
    const { provider, requested } = providerServing({
      "/stream/s-2/107260/dub": embedPage,
      "/stream/getSources": sources(undefined, undefined)
    });

    await skipSegments(provider, "anikoto:107260", "dub");

    expect(requested).toEqual([
      "https://megaplay.buzz/stream/s-2/107260/dub",
      "https://megaplay.buzz/stream/getSources?id=23417"
    ]);
  });

  test("treats MegaPlay's 0–0 placeholder as no segment", async () => {
    const { provider } = providerServing({
      "/stream/s-2/1/sub": embedPage,
      "/stream/getSources": sources(
        {
          start: 0,
          end: 0
        },
        {
          start: 0,
          end: 0
        }
      )
    });

    expect(await skipSegments(provider, "anikoto:1", "sub")).toEqual([]);
  });

  test("keeps a known span when the other is missing", async () => {
    const { provider } = providerServing({
      "/stream/s-2/1/sub": embedPage,
      "/stream/getSources": sources(undefined, {
        start: 1300,
        end: 1390
      })
    });

    expect(await skipSegments(provider, "anikoto:1", "sub")).toEqual([
      {
        kind: "ending",
        start: 1300,
        end: 1390
      }
    ]);
  });

  test("drops a span that ends before it starts", async () => {
    const { provider } = providerServing({
      "/stream/s-2/1/sub": embedPage,
      "/stream/getSources": sources(
        {
          start: 90,
          end: 10
        },
        undefined
      )
    });

    expect(await skipSegments(provider, "anikoto:1", "sub")).toEqual([]);
  });

  test("orders spans by start time", async () => {
    // A cold open can put the opening after an early ending card.
    const { provider } = providerServing({
      "/stream/s-2/1/sub": embedPage,
      "/stream/getSources": sources(
        {
          start: 300,
          end: 390
        },
        {
          start: 10,
          end: 40
        }
      )
    });

    expect((await skipSegments(provider, "anikoto:1", "sub")).map((segment) => segment.kind)).toEqual([
      "ending",
      "opening"
    ]);
  });

  test("fails when MegaPlay has no source in that language", async () => {
    const { provider } = providerServing({
      "/stream/s-2/1/dub": errorPage
    });

    await expect(provider.resolveStream("anikoto:1", "dub")).rejects.toThrow("MegaPlay has no dub source");
  });

  test("drops a malformed span without failing the stream", async () => {
    const { provider } = providerServing({
      "/stream/s-2/1/sub": embedPage,
      "/stream/getSources": sources(
        {
          start: -5,
          end: 90
        },
        {
          start: 1300,
          end: 1390
        }
      )
    });

    expect(await skipSegments(provider, "anikoto:1", "sub")).toEqual([
      {
        kind: "ending",
        start: 1300,
        end: 1390
      }
    ]);
  });
});

/**
 * AniKoto's series API, listing `numbers` with an embed for each language
 * in `languages`. Its episodes default to 56–58 of Naruto: Shippuden, sub only.
 */
function seriesResponseOf(numbers: readonly number[], languages: (number: number) => readonly string[] = () => ["sub"]) {
  return JSON.stringify({
    ok: true,
    data: {
      episodes: numbers.map((number) => ({
        id: 27298 + number,
        title: `Episode ${number}`,
        number,
        episode_embed_id: `${7880 + number}`,
        embed_url: Object.fromEntries(
          languages(number).map((language) => [language, `https://megaplay.buzz/stream/s-2/${7880 + number}/${language}`])
        )
      }))
    }
  });
}

const seriesResponse = seriesResponseOf([56, 57, 58]);

/** One link of AniKoto's episode list. `sub` and `dub` default to flagged and unflagged. */
interface ListedLink {
  className?: string;
  sub?: "0" | "1";
  dub?: "0" | "1";
}

/** AniKoto's episode list, as its watch page loads it, with a link per episode number. */
function episodeList(links: Record<number, ListedLink | string>) {
  const items = Object.entries(links).map(([number, link]) => {
    const { className = "", sub = "1", dub = "0" } = typeof link === "string" ? { className: link } : link;
    return `<li title="Episode ${number}"><a href="#" data-id="1" data-num="${number}" data-slug="${number}" data-mal="44037" data-timestamp="1729246208" data-sub="${sub}" data-dub="${dub}" data-ids="SmV3" class="${className}" >${number}</a></li>`;
  });
  return JSON.stringify({
    status: 200,
    result: `<div class="body"><ul class="ep-range">${items.join("\n")}</ul></div>`
  });
}

describe("AniKotoStreamProvider.listEpisodes", () => {
  test("marks the episodes AniKoto's episode list tags as filler, as in Naruto: Shippuden", async () => {
    const { provider } = providerServing({
      "/series/1498": seriesResponse,
      "/ajax/episode/list/1498": episodeList({
        56: "  ",
        57: " filler ",
        58: "active filler"
      })
    });

    const units = await provider.listEpisodes("1498");

    expect(units.map((unit) => [unit.number, unit.isFiller])).toEqual([
      [56, false],
      [57, true],
      [58, true]
    ]);
  });

  test("keeps the episode IDs stored lists hold, which resolveStream takes", async () => {
    const { provider } = providerServing({
      "/series/1498": seriesResponse
    });

    const units = await provider.listEpisodes("1498");

    expect(units.map((unit) => unit.id)).toEqual(["anikoto:7936", "anikoto:7937", "anikoto:7938"]);
  });

  test("lists the episodes without filler flags when the episode list cannot be read", async () => {
    const { provider } = providerServing({
      "/series/1498": seriesResponse
    });

    const units = await provider.listEpisodes("1498");

    expect(units.map((unit) => [unit.number, unit.isFiller])).toEqual([
      [56, null],
      [57, null],
      [58, null]
    ]);
  });

  test("leaves filler unknown rather than false when the episode list has no episodes", async () => {
    const { provider } = providerServing({
      "/series/1498": seriesResponse,
      "/ajax/episode/list/1498": episodeList({})
    });

    const units = await provider.listEpisodes("1498");

    expect(units.every((unit) => unit.isFiller === null)).toBe(true);
  });
});

describe("AniKotoStreamProvider.listEpisodes languages", () => {
  test("adds dubs the API leaves out, as in Banished from the Hero's Party episodes 1–3", async () => {
    const { provider } = providerServing({
      "/series/6752": seriesResponseOf([1, 2, 3, 4], (number) => (number < 4 ? ["sub"] : ["sub", "dub"])),
      "/ajax/episode/list/6752": episodeList({
        1: { className: "active", dub: "1" },
        2: { dub: "1" },
        3: { dub: "1" },
        4: { dub: "1" }
      })
    });

    const units = await provider.listEpisodes("6752");

    expect(units.map((unit) => [unit.number, unit.languages])).toEqual([
      [1, ["sub", "dub"]],
      [2, ["sub", "dub"]],
      [3, ["sub", "dub"]],
      [4, ["sub", "dub"]]
    ]);
  });

  test("lists no dub when neither the API nor the episode list has one", async () => {
    const { provider } = providerServing({
      "/series/1498": seriesResponse,
      "/ajax/episode/list/1498": episodeList({
        56: {},
        57: {},
        58: {}
      })
    });

    const units = await provider.listEpisodes("1498");

    expect(units.every((unit) => unit.languages?.join() === "sub")).toBe(true);
  });

  test("keeps a language the API has an embed for when the episode list does not flag it", async () => {
    const { provider } = providerServing({
      "/series/1498": seriesResponseOf([56], () => ["sub", "dub"]),
      "/ajax/episode/list/1498": episodeList({
        56: { dub: "0" }
      })
    });

    const [unit] = await provider.listEpisodes("1498");

    expect(unit?.languages).toEqual(["sub", "dub"]);
  });

  test("lists a dub-only episode without a sub", async () => {
    const { provider } = providerServing({
      "/series/1498": seriesResponseOf([56], () => ["dub"]),
      "/ajax/episode/list/1498": episodeList({
        56: { sub: "0", dub: "1" }
      })
    });

    const [unit] = await provider.listEpisodes("1498");

    expect(unit?.languages).toEqual(["dub"]);
  });

  test("keeps the API's languages when the episode list cannot be read", async () => {
    const { provider } = providerServing({
      "/series/6752": seriesResponseOf([1, 4], (number) => (number < 4 ? ["sub"] : ["sub", "dub"]))
    });

    const units = await provider.listEpisodes("6752");

    expect(units.map((unit) => [unit.number, unit.languages])).toEqual([
      [1, ["sub"]],
      [4, ["sub", "dub"]]
    ]);
  });

  test("keeps the API's languages, and leaves filler unknown, for an episode the list leaves out", async () => {
    const { provider } = providerServing({
      "/series/1498": seriesResponseOf([56, 57]),
      "/ajax/episode/list/1498": episodeList({
        56: { className: "filler", dub: "1" }
      })
    });

    const units = await provider.listEpisodes("1498");

    expect(units.map((unit) => [unit.number, unit.languages, unit.isFiller])).toEqual([
      [56, ["sub", "dub"], true],
      [57, ["sub"], null]
    ]);
  });
});
