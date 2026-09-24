import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { ContentLanguage, ResolvedMediaStream } from "anime-sdk";

import { EpisodeNotFoundError, PlaybackUnavailableError } from "../../errors";

/** A provider stand-in that lists episode 3 and streams the languages it has. */
interface FakeProvider {
  id: string;
  locale: string;
  languages: ContentLanguage[];
  fails?: boolean;
}

/** The registry's `streamProviders`, filled in place by {@link useProviders}. */
const streamProviders: {
  provider: {
    id: string;
    resolveStream: (unitId: string, language: ContentLanguage) => Promise<ResolvedMediaStream>;
  };
  locale: string;
  listsLanguages: boolean;
}[] = [];
const units = new Map<string, ContentLanguage[]>();
const resolved: string[] = [];

function useProviders(list: FakeProvider[]) {
  units.clear();
  streamProviders.splice(
    0,
    streamProviders.length,
    ...list.map((fake) => {
      units.set(fake.id, fake.languages);
      return {
        provider: {
          id: fake.id,
          resolveStream: async (unitId: string, language: ContentLanguage): Promise<ResolvedMediaStream> => {
            resolved.push(`${unitId}/${language}`);
            if (fake.fails) {
              throw new Error(`${fake.id} is down`);
            }
            return {
              type: "video",
              streams: [
                {
                  sourceUrl: `https://${fake.id}.example/${language}.m3u8`,
                  isHLS: true,
                  quality: "auto",
                  language
                }
              ]
            };
          }
        },
        locale: fake.locale,
        listsLanguages: true
      };
    })
  );
}

mock.module("../../series/episodes", () => ({
  locateEpisode: async () => ({
    anilistId: 154587,
    anilistEpisode: 3
  }),
  anilistEpisodeKey: (anilistId: number, episode: number) => `${anilistId}:${episode}`
}));
mock.module("../../catalog/queries/anime", () => ({
  getAnime: async (id: number) => ({
    id
  })
}));
mock.module("../episodes/episodes", () => ({
  getProviderUnits: async (_anime: unknown, provider: { id: string }) => [
    {
      id: `${provider.id}:3`,
      number: 3,
      title: "Episode 3",
      languages: units.get(provider.id) ?? null
    }
  ]
}));
mock.module("../providers/registry", () => ({
  streamProviders
}));
mock.module("../proxy/proxy", () => ({
  createStreamToken: (url: string) => `token:${url}`
}));

const { resolvePlayback } = await import("./resolve");

beforeEach(() => {
  resolved.length = 0;
});

describe("resolvePlayback", () => {
  test("serves an English dub by default, from the first English provider", async () => {
    useProviders([
      {
        id: "brazilian",
        locale: "pt-BR",
        languages: ["dub"]
      },
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub", "dub"]
      }
    ]);

    const playback = await resolvePlayback({
      seasonId: "season",
      episode: 3,
      language: "dub"
    });

    expect(playback).toMatchObject({
      language: "dub",
      locale: "en",
      provider: "anikoto"
    });
    expect(resolved).toEqual(["anikoto:3/dub"]);
  });

  test("never falls back to a dub in another locale", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub"]
      },
      {
        id: "brazilian",
        locale: "pt-BR",
        languages: ["dub"]
      }
    ]);

    await expect(
      resolvePlayback({
        seasonId: "season",
        episode: 3,
        language: "dub"
      })
    ).rejects.toBeInstanceOf(PlaybackUnavailableError);
    expect(resolved).toEqual([]);
  });

  test("serves the requested locale", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub", "dub"]
      },
      {
        id: "brazilian",
        locale: "pt-BR",
        languages: ["dub"]
      }
    ]);

    expect(
      await resolvePlayback({
        seasonId: "season",
        episode: 3,
        language: "dub",
        locale: "pt-BR"
      })
    ).toMatchObject({
      locale: "pt-BR",
      provider: "brazilian"
    });
  });

  test("applies the locale to a sub's subtitles too", async () => {
    useProviders([
      {
        id: "brazilian",
        locale: "pt-BR",
        languages: ["sub"]
      },
      {
        id: "allmanga",
        locale: "en",
        languages: ["sub"]
      }
    ]);

    expect(
      await resolvePlayback({
        seasonId: "season",
        episode: 3
      })
    ).toMatchObject({
      language: "sub",
      locale: "en",
      provider: "allmanga"
    });
  });

  test("serves raw from any provider and reports no locale", async () => {
    useProviders([
      {
        id: "brazilian",
        locale: "pt-BR",
        languages: ["raw"]
      }
    ]);

    expect(
      await resolvePlayback({
        seasonId: "season",
        episode: 3,
        language: "raw"
      })
    ).toMatchObject({
      language: "raw",
      locale: null,
      provider: "brazilian"
    });
  });

  test("falls through a failing provider to the next in the same locale", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["dub"],
        fails: true
      },
      {
        id: "allmanga",
        locale: "en",
        languages: ["dub"]
      }
    ]);

    expect(
      await resolvePlayback({
        seasonId: "season",
        episode: 3,
        language: "dub"
      })
    ).toMatchObject({
      provider: "allmanga"
    });
  });

  test("reports the episode missing when no provider in the locale lists it", async () => {
    useProviders([
      {
        id: "brazilian",
        locale: "pt-BR",
        languages: ["dub"]
      }
    ]);

    await expect(
      resolvePlayback({
        seasonId: "season",
        episode: 3,
        language: "dub"
      })
    ).rejects.toBeInstanceOf(EpisodeNotFoundError);
  });
});
