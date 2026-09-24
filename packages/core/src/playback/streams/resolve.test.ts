import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { ContentLanguage, ResolvedMediaStream } from "anime-sdk";

import { EpisodeNotFoundError, PlaybackUnavailableError } from "../../errors";
import type { EpisodeVersion } from "../episodes/versions";
import type { SkipSegment } from "../providers/megaplay";

/** A provider stand-in that lists episode 3 and streams the languages it has. */
interface FakeProvider {
  id: string;
  locale: string;
  languages: ContentLanguage[];
  fails?: boolean;
  /** Whether its streams come without subtitle tracks, such as hardsubbed ones. */
  noSubtitles?: boolean;
  /** The skip segments its player ships with each language's stream. */
  skipSegments?: Partial<Record<ContentLanguage, SkipSegment[]>>;
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
/** The versions the stored episode lists offer, for `getEpisodeVersions`. */
let offered: EpisodeVersion[] = [];


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
          resolveStream: async (unitId: string, language: ContentLanguage): Promise<ResolvedMediaStream & { skipSegments?: SkipSegment[] }> => {
            resolved.push(`${unitId}/${language}`);
            if (fake.fails) {
              throw new Error(`${fake.id} is down`);
            }
            return {
              type: "video",
              skipSegments: fake.skipSegments?.[language],
              streams: [
                {
                  sourceUrl: `https://${fake.id}.example/${language}.m3u8`,
                  isHLS: true,
                  quality: "auto",
                  language,
                  subtitles: fake.noSubtitles
                    ? []
                    : [
                        {
                          url: `https://${fake.id}.example/en.vtt`,
                          language: "en",
                          label: "English"
                        },
                        {
                          url: `https://${fake.id}.example/pt.vtt`,
                          language: "pt",
                          label: "Portuguese"
                        }
                      ]
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
mock.module("../episodes/versions", () => ({
  getEpisodeVersions: async () => offered
}));
mock.module("../providers/registry", () => ({
  servedLocale: "en",
  isServedSubtitle: (track: { language: string }) => track.language === "en",
  streamProviders
}));
mock.module("../proxy/proxy", () => ({
  createStreamToken: (url: string) => `token:${url}`
}));
mock.module("../providers/megaplay", () => ({
  skipSegmentsOf: (resolved: { skipSegments?: SkipSegment[] }) => resolved.skipSegments ?? []
}));

const { resolvePlayback } = await import("./resolve");

const request = {
  animeId: "series",
  seasonId: "season",
  episode: 3
};
const options = {
  streamBaseUrl: "https://sora.example/v1/streams/"
};

const sub = (locale = "en"): EpisodeVersion => ({
  language: "sub",
  locale
});
const dub = (locale = "en"): EpisodeVersion => ({
  language: "dub",
  locale
});

/** Each resolved version as `language/locale@provider`. */
async function resolvedVersions() {
  const playback = await resolvePlayback(request, options);
  return playback.media.map((version) => `${version.audio}/${version.locale}@${version.provider}`);
}

beforeEach(() => {
  resolved.length = 0;
  offered = [];
});

describe("resolvePlayback", () => {
  test("serves English dub and sub together, never another locale", async () => {
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
    offered = [dub(), dub("pt-BR"), sub()];

    expect(await resolvedVersions()).toEqual(["dub/en@anikoto", "sub/en@anikoto"]);
    await expect(resolvePlayback(request, options)).resolves.toMatchObject({
      animeId: "series",
      seasonId: "season",
      episode: 3
    });
  });

  test("gives each version the skip segments of its own stream", async () => {
    // Attack on Titan episode 1: the dub's opening starts 16 seconds later.
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub", "dub"],
        skipSegments: {
          dub: [
            {
              kind: "opening",
              start: 154,
              end: 230
            }
          ],
          sub: [
            {
              kind: "opening",
              start: 138,
              end: 215
            }
          ]
        }
      }
    ]);
    offered = [dub(), sub()];

    const playback = await resolvePlayback(request, options);
    expect(playback.media.map((media) => [media.audio, media.skipSegments[0]?.start])).toEqual([
      ["dub", 154],
      ["sub", 138]
    ]);
  });

  test("gives no skip segments for a stream whose player reports none", async () => {
    useProviders([
      {
        id: "animeparadise",
        locale: "en",
        languages: ["sub"]
      }
    ]);
    offered = [sub()];

    expect((await resolvePlayback(request, options)).media[0]?.skipSegments).toEqual([]);
  });

  test("hands out proxy URLs a player can fetch as is", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub"]
      }
    ]);
    offered = [sub()];

    const [version] = (await resolvePlayback(request, options)).media;
    expect(version?.sources.map((source) => source.url)).toEqual([
      `https://sora.example/v1/streams/${encodeURIComponent("token:https://anikoto.example/sub.m3u8")}`
    ]);
    expect(version?.subtitles.map((subtitle) => subtitle.url)).toEqual([
      `https://sora.example/v1/streams/${encodeURIComponent("token:https://anikoto.example/en.vtt")}`
    ]);
  });

  test("tries dub and sub in English when no provider says which languages the episode has", async () => {
    useProviders([
      {
        id: "megaplay",
        locale: "en",
        languages: ["sub", "dub"]
      }
    ]);

    expect(await resolvedVersions()).toEqual(["dub/en@megaplay", "sub/en@megaplay"]);
  });

  test("leaves out a version no provider can stream right now", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub"]
      }
    ]);
    offered = [dub(), sub()];

    expect(await resolvedVersions()).toEqual(["sub/en@anikoto"]);
    expect(resolved).toEqual(["anikoto:3/sub"]);
  });

  test("never serves a version from a provider in another locale", async () => {
    useProviders([
      {
        id: "brazilian",
        locale: "pt-BR",
        languages: ["sub", "dub"]
      },
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub"]
      }
    ]);
    offered = [dub(), sub()];

    expect(await resolvedVersions()).toEqual(["sub/en@anikoto"]);
  });

  test("gives a dub no subtitles, since the sub's do not match its audio", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["dub"]
      }
    ]);
    offered = [dub()];

    const playback = await resolvePlayback(request, options);
    expect(playback.media[0]?.subtitles).toEqual([]);
    expect(playback.media[0]?.hardsub).toBe(false);
  });

  test("keeps only English subtitles", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub"]
      }
    ]);
    offered = [sub()];

    const playback = await resolvePlayback(request, options);
    expect(playback.media[0]?.subtitles.map((track) => track.language)).toEqual(["en"]);
  });

  test("prefers a later provider's subtitle tracks to burned-in subtitles", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub"],
        noSubtitles: true
      },
      {
        id: "allmanga",
        locale: "en",
        languages: ["sub"]
      }
    ]);
    offered = [sub()];

    expect(await resolvedVersions()).toEqual(["sub/en@allmanga"]);
    expect((await resolvePlayback(request, options)).media[0]?.hardsub).toBe(false);
  });

  test("serves burned-in subtitles marked hardsub when no provider has tracks", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub", "dub"],
        noSubtitles: true
      }
    ]);
    offered = [dub(), sub()];

    const playback = await resolvePlayback(request, options);
    expect(playback.media.map((version) => [version.audio, version.provider, version.hardsub, version.subtitles.length])).toEqual([
      ["dub", "anikoto", false, 0],
      ["sub", "anikoto", true, 0]
    ]);
  });

  test("serves raw from an English provider and reports no locale", async () => {
    useProviders([
      {
        id: "brazilian",
        locale: "pt-BR",
        languages: ["raw"]
      },
      {
        id: "allmanga",
        locale: "en",
        languages: ["raw"]
      }
    ]);
    offered = [
      {
        language: "raw",
        locale: null
      }
    ];

    expect(await resolvedVersions()).toEqual(["raw/null@allmanga"]);
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
    offered = [dub()];

    expect(await resolvedVersions()).toEqual(["dub/en@allmanga"]);
  });

  test("reports playback unavailable when providers list the episode but none can stream it", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub", "dub"],
        fails: true
      }
    ]);
    offered = [dub(), sub()];

    await expect(resolvePlayback(request, options)).rejects.toBeInstanceOf(PlaybackUnavailableError);
  });

  test("reports the episode missing when no provider in a wanted locale lists it", async () => {
    useProviders([
      {
        id: "brazilian",
        locale: "pt-BR",
        languages: ["dub"]
      }
    ]);

    await expect(resolvePlayback(request, options)).rejects.toBeInstanceOf(EpisodeNotFoundError);
  });
});
