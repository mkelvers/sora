import { beforeEach, describe, expect, mock, test } from "bun:test";

import { EpisodeNotFoundError, PlaybackUnavailableError } from "../../errors";
import type { ContentLanguage } from "../../series/models";
import type { EpisodeVersion } from "../episodes/versions";
import type { ProviderStream, SkipSegment } from "../providers/provider";

/** A provider stand-in that lists episode 3 and streams the languages it has. */
interface FakeProvider {
  id: string;
  locale: string;
  languages: ContentLanguage[];
  fails?: boolean;
  /** Whether its streams come without subtitle tracks, such as hardsubbed ones. */
  noSubtitles?: boolean;
  /** Whether its subtitle files cannot be fetched from any host. */
  unreachableSubtitles?: boolean;
  /** The skip segments its player ships with each language's stream. */
  skipSegments?: Partial<Record<ContentLanguage, SkipSegment[]>>;
}

/** The registry's `streamProviders`, filled in place by {@link useProviders}. */
const streamProviders: {
  id: string;
  locale: string;
  listsLanguages: boolean;
  resolveStream: (episodeId: string, language: ContentLanguage) => Promise<ProviderStream>;
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
        id: fake.id,
        locale: fake.locale,
        listsLanguages: true,
        resolveStream: async (episodeId: string, language: ContentLanguage): Promise<ProviderStream> => {
          resolved.push(`${episodeId}/${language}`);
          if (fake.fails) {
            throw new Error(`${fake.id} is down`);
          }
          return {
            skipSegments: fake.skipSegments?.[language] ?? [],
            videos: [
              {
                url: `https://${fake.id}.example/${language}.m3u8`,
                format: "hls",
                quality: "auto",
                headers: {},
                subtitles: fake.noSubtitles
                  ? []
                  : [
                      {
                        url: `https://${fake.id}${fake.unreachableSubtitles ? ".unreachable" : ""}.example/en.vtt`,
                        language: "en",
                        label: "English",
                        format: "vtt"
                      },
                      {
                        url: `https://${fake.id}.example/pt.vtt`,
                        language: "pt",
                        label: "Portuguese",
                        format: null
                      }
                    ]
              }
            ]
          };
        }
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
/** Segment start times `segmentStarts` hands out, by playlist URL. */
const timelines = new Map<string, number[]>();

mock.module("../proxy/proxy", () => ({
  createStreamToken: (url: string, _kind: string, _headers: unknown, options?: { shifts?: unknown }) =>
    options?.shifts ? `token:${url}@${JSON.stringify(options.shifts)}` : `token:${url}`,
  segmentStarts: async (url: string) => timelines.get(url) ?? [],
  canFetchStream: async (url: string) => !url.includes(".unreachable."),
  tokenLifetimeMs: 6 * 60 * 60 * 1_000
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

/** Segment boundaries of a made-up encode: irregular, as scene cuts are. */
function boundaries(seed: number) {
  const times = [0];
  let state = seed;
  for (let index = 1; index < 300; index++) {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    times.push(times.at(-1)! + 1 + (state % 9_000) / 1_000);
  }
  return times;
}

beforeEach(() => {
  resolved.length = 0;
  offered = [];
  timelines.clear();
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

  test("says when its stream URLs expire", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub"]
      }
    ]);
    offered = [sub()];

    const before = Date.now();
    const { expiresAt } = await resolvePlayback(request, options);
    expect(Date.parse(expiresAt) - before).toBeGreaterThanOrEqual(6 * 60 * 60 * 1_000);
    expect(Date.parse(expiresAt) - Date.now()).toBeLessThanOrEqual(6 * 60 * 60 * 1_000);
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
      `https://sora.example/v1/streams/${encodeURIComponent("token:https://anikoto.example/en.vtt")}`,
      `https://sora.example/v1/streams/${encodeURIComponent("token:https://anikoto.example/pt.vtt")}`
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

  test("keeps every subtitle language, English first, named by its tag", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub"]
      }
    ]);
    offered = [sub()];

    const playback = await resolvePlayback(request, options);
    expect(playback.media[0]?.subtitles.map((track) => [track.language, track.label])).toEqual([
      ["en", "English"],
      ["pt", "Portuguese"]
    ]);
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

  test("skips a sub whose English subtitles cannot be fetched", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub", "dub"],
        unreachableSubtitles: true
      },
      {
        id: "allmanga",
        locale: "en",
        languages: ["sub"]
      }
    ]);
    offered = [dub(), sub()];

    expect(await resolvedVersions()).toEqual(["dub/en@anikoto", "sub/en@allmanga"]);
  });

  test("gives a dub the sub's subtitles, retimed to the dub's encode", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub", "dub"]
      }
    ]);
    offered = [dub(), sub()];
    const subTimeline = boundaries(1);
    timelines.set("https://anikoto.example/sub.m3u8", subTimeline);
    timelines.set("https://anikoto.example/dub.m3u8", subTimeline.map((time) => time + 2));

    const [dubbed] = (await resolvePlayback(request, options)).media;
    expect(dubbed?.audio).toBe("dub");
    expect(dubbed?.subtitles.map((track) => decodeURIComponent(track.url))).toEqual([
      'https://sora.example/v1/streams/token:https://anikoto.example/en.vtt@[{"from":0,"offset":2}]'
    ]);
  });

  test("gives a dub no subtitles when its encode does not align with the sub's", async () => {
    useProviders([
      {
        id: "anikoto",
        locale: "en",
        languages: ["sub", "dub"]
      }
    ]);
    offered = [dub(), sub()];
    timelines.set("https://anikoto.example/sub.m3u8", boundaries(1));
    timelines.set("https://anikoto.example/dub.m3u8", boundaries(2));

    expect((await resolvePlayback(request, options)).media[0]?.subtitles).toEqual([]);
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
