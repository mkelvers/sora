import { describe, expect, test } from "bun:test";

import { HttpClient } from "anime-sdk";

import { AniKotoStreamProvider } from "./anikoto";

const embedPage = "<html><head><title>File 23417 - MegaPlay</title></head></html>";
const errorPage = "<html><head><title>Error - MegaPlay</title></head></html>";

/** `getSources` as MegaPlay sends it, with the encrypted source elided. */
function sources(intro: object | undefined, outro: object | undefined) {
  return JSON.stringify({
    tracks: [],
    t: 1,
    intro,
    outro,
    server: 4,
    enc: "elided"
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
    provider: new AniKotoStreamProvider(http),
    requested
  };
}

describe("AniKotoStreamProvider.resolveSkipSpans", () => {
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

    expect(await provider.resolveSkipSpans("anikoto:107260", "sub")).toEqual([
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

  test("requests the embed for the unwrapped unit ID and language, then its file's sources", async () => {
    const { provider, requested } = providerServing({
      "/stream/s-2/107260/dub": embedPage,
      "/stream/getSources": sources(undefined, undefined)
    });

    await provider.resolveSkipSpans("anikoto:107260", "dub");

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

    expect(await provider.resolveSkipSpans("anikoto:1", "sub")).toEqual([]);
  });

  test("keeps a known span when the other is missing", async () => {
    const { provider } = providerServing({
      "/stream/s-2/1/sub": embedPage,
      "/stream/getSources": sources(undefined, {
        start: 1300,
        end: 1390
      })
    });

    expect(await provider.resolveSkipSpans("anikoto:1", "sub")).toEqual([
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

    expect(await provider.resolveSkipSpans("anikoto:1", "sub")).toEqual([]);
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

    expect((await provider.resolveSkipSpans("anikoto:1", "sub")).map((span) => span.kind)).toEqual([
      "ending",
      "opening"
    ]);
  });

  test("fails when MegaPlay has no source in that language", async () => {
    const { provider } = providerServing({
      "/stream/s-2/1/dub": errorPage
    });

    await expect(provider.resolveSkipSpans("anikoto:1", "dub")).rejects.toThrow("MegaPlay has no dub source");
  });

  test("fails on a malformed skip span", async () => {
    const { provider } = providerServing({
      "/stream/s-2/1/sub": embedPage,
      "/stream/getSources": sources(
        {
          start: -5,
          end: 90
        },
        undefined
      )
    });

    await expect(provider.resolveSkipSpans("anikoto:1", "sub")).rejects.toThrow();
  });
});
