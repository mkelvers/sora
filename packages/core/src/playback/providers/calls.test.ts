import { describe, expect, test } from "bun:test";

import type { Anime } from "../../catalog/models/anime";
import { recordingCalls, type ProviderCall } from "./calls";
import type { ProviderEpisode, ProviderStream, StreamProvider } from "./provider";

const anime = {
  id: 1
} as Anime;

const episode: ProviderEpisode = {
  id: "fake:1",
  number: 1,
  title: "Episode 1",
  languages: ["sub"],
  isFiller: null
};

const stream: ProviderStream = {
  videos: [
    {
      url: "https://fake.example/master.m3u8",
      format: "hls",
      quality: "auto",
      headers: {},
      subtitles: []
    }
  ],
  skipSegments: []
};

/** A provider that answers with `answers`, wrapped so its calls land in `calls`. */
function recorded(answers: Partial<StreamProvider>, record?: (call: ProviderCall) => Promise<void>) {
  const calls: ProviderCall[] = [];
  const provider = recordingCalls(
    {
      id: "fake",
      locale: "en",
      listsLanguages: true,
      findMedia: async () => null,
      listEpisodes: async () => [],
      resolveStream: async () => stream,
      ...answers
    },
    record ??
      (async (call) => {
        calls.push(call);
      })
  );

  return {
    provider,
    calls
  };
}

/** Each recorded call as `operation:outcome`. */
const outcomes = (calls: ProviderCall[]) => calls.map((call) => `${call.operation}:${call.outcome}`);

describe("recordingCalls", () => {
  test("records a result as ok and passes it through", async () => {
    const { provider, calls } = recorded({
      listEpisodes: async () => [episode]
    });

    expect(await provider.listEpisodes("1")).toEqual([episode]);
    expect(await provider.resolveStream("fake:1", "sub")).toBe(stream);
    expect(outcomes(calls)).toEqual(["list_episodes:ok", "resolve_stream:ok"]);
  });

  test("records no match and no episodes as empty, which a broken scraper often returns", async () => {
    const { provider, calls } = recorded({});

    expect(await provider.findMedia(anime)).toBeNull();
    expect(await provider.listEpisodes("1")).toEqual([]);
    expect(outcomes(calls)).toEqual(["find_media:empty", "list_episodes:empty"]);
  });

  test("records a thrown error as failed with its message, and rethrows it", async () => {
    const error = new Error("MegaPlay has no dub source for this episode");
    const { provider, calls } = recorded({
      resolveStream: async () => {
        throw error;
      }
    });

    await expect(provider.resolveStream("fake:1", "dub")).rejects.toBe(error);
    expect(calls).toEqual([
      expect.objectContaining({
        provider: "fake",
        operation: "resolve_stream",
        outcome: "failed",
        error: "MegaPlay has no dub source for this episode"
      })
    ]);
  });

  test("cuts long error messages, such as ones quoting a whole page", async () => {
    const { provider, calls } = recorded({
      listEpisodes: async () => {
        throw new Error("x".repeat(10_000));
      }
    });

    await provider.listEpisodes("1").catch(() => undefined);

    expect(calls[0]?.error?.length).toBe(500);
  });

  test("keeps no error for calls that did not fail", async () => {
    const { provider, calls } = recorded({});

    await provider.findMedia(anime);

    expect(calls[0]?.error).toBeNull();
  });

  test("never fails a call because recording it failed", async () => {
    const { provider } = recorded(
      {
        listEpisodes: async () => [episode]
      },
      async () => {
        throw new Error("database is down");
      }
    );

    expect(await provider.listEpisodes("1")).toEqual([episode]);
  });

  test("offers syncCatalog only when the provider has one", async () => {
    const { provider: without } = recorded({});
    const { provider: withSync, calls } = recorded({
      syncCatalog: async () => "Synced 3 series"
    });

    expect(without.syncCatalog).toBeUndefined();
    expect(await withSync.syncCatalog?.({ full: false })).toBe("Synced 3 series");
    expect(outcomes(calls)).toEqual(["sync_catalog:ok"]);
  });

  test("keeps the provider's ID and traits", () => {
    const { provider } = recorded({
      id: "megaplay",
      listsLanguages: false
    });

    expect([provider.id, provider.locale, provider.listsLanguages]).toEqual(["megaplay", "en", false]);
  });
});
