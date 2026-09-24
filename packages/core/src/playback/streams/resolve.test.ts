import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { ContentLanguage, ResolvedMediaStream } from "anime-sdk";

import { EpisodeNotFoundError, PlaybackUnavailableError } from "../../errors";
import type { EpisodeVersion } from "../episodes/versions";

/** A provider stand-in that lists episode 3 and streams the languages it has. */
interface FakeProvider {
  id: string;
  locale: string;
  languages: ContentLanguage[];
  fails?: boolean;
  /** Whether its streams come without subtitle tracks, such as hardsubbed ones. */
  noSubtitles?: boolean;
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

const { resolvePlayback } = await import("./resolve");

const request = {
  animeId: "series",
  seasonId: "season",
  episode: 3
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
  const playback = await resolvePlayback(request);
  return playback.versions.map((version) => `${version.audio}/${version.locale}@${version.provider}`);
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
    await expect(resolvePlayback(request)).resolves.toMatchObject({
      animeId: "series",
      seasonId: "season",
      episode: 3
    });
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

  test("keeps only English subtitles", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub"]
      }
    ]);
    offered = [sub()];

    const playback = await resolvePlayback(request);
    expect(playback.versions[0]?.subtitles.map((track) => track.language)).toEqual(["en"]);
  });

  test("passes over a sub without subtitle tracks for the next provider", async () => {
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
  });

  test("leaves a sub out when no provider has subtitles for it, but keeps the dub", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub", "dub"],
        noSubtitles: true
      }
    ]);
    offered = [dub(), sub()];

    expect(await resolvedVersions()).toEqual(["dub/en@anikoto"]);
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

    await expect(resolvePlayback(request)).rejects.toBeInstanceOf(PlaybackUnavailableError);
  });

  test("reports the episode missing when no provider in a wanted locale lists it", async () => {
    useProviders([
      {
        id: "brazilian",
        locale: "pt-BR",
        languages: ["dub"]
      }
    ]);

    await expect(resolvePlayback(request)).rejects.toBeInstanceOf(EpisodeNotFoundError);
  });
});
