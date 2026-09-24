import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { ContentLanguage } from "anime-sdk";

import type { ProviderUnit } from "./episodes";
import type { ListedUnit } from "./versions";

/**
 * A provider stand-in: its ID, what it serves, its stored episode list for
 * each anime (`undefined` for an anime it has not been looked up for), and
 * what it answers when asked.
 */
interface FakeProvider {
  id: string;
  locale: string;
  listsLanguages: boolean;
  units: (anilistId: number) => ProviderUnit[] | undefined;
  ask: () => Promise<ProviderUnit[]>;
}

let providers: FakeProvider[] = [];
let anilistEpisode = 3;
let queuedLookups: number[] = [];
let asks = 0;

/** The registry's `streamProviders`, kept in step with `providers` by {@link useProviders}. */
const streamProviders: {
  provider: {
    id: string;
  };
  locale: string;
  listsLanguages: boolean;
}[] = [];

function useProviders(list: FakeProvider[]) {
  providers = list;
  streamProviders.splice(
    0,
    streamProviders.length,
    ...list.map(({ id, locale, listsLanguages }) => ({
      provider: {
        id
      },
      locale,
      listsLanguages
    }))
  );
}

mock.module("../../series/episodes", () => ({
  locateEpisode: async () => ({
    anilistId: 154587,
    anilistEpisode
  }),
  anilistEpisodeKey: (anilistId: number, episode: number) => `${anilistId}:${episode}`
}));
mock.module("../../scheduler/queue", () => ({
  scheduleEpisodeLookup: async (anilistId: number) => {
    queuedLookups.push(anilistId);
  }
}));
mock.module("../../catalog/queries/anime", () => ({
  getAnime: async (id: number) => ({
    id
  })
}));
mock.module("./episodes", () => ({
  getProviderUnits: (_anime: unknown, target: { id: string }) => {
    asks += 1;
    return providers.find((candidate) => candidate.id === target.id)?.ask() ?? Promise.resolve([]);
  },
  getStoredUnits: async (anilistIds: readonly number[]) =>
    [...new Set(anilistIds)].flatMap((anilistId) =>
      providers.flatMap((candidate) => {
        const units = candidate.units(anilistId);
        return units
          ? [
              {
                anilistId,
                provider: candidate.id,
                units
              }
            ]
          : [];
      })
    )
}));
mock.module("../providers/registry", () => ({
  streamProviders
}));

const { fillerOf, findEpisodeListings, getEpisodeVersions, languagesOf, versionsOffered } = await import("./versions");

/** {@link findEpisodeListings} with only each episode's languages, for tests about those. */
async function findEpisodeLanguages(...args: Parameters<typeof findEpisodeListings>) {
  const found = await findEpisodeListings(...args);
  return new Map([...found].map(([key, listing]) => [key, listing.languages]));
}

const unit = (number: number, languages: ContentLanguage[] | null, isFiller: boolean | null = null): ProviderUnit => ({
  id: `unit-${number}`,
  number,
  title: `Episode ${number}`,
  languages,
  isFiller
});

const listed = (locale: string, languages: ContentLanguage[] | null, listsLanguages = true): ListedUnit => ({
  source: {
    locale,
    listsLanguages
  },
  unit: unit(1, languages)
});

/** A provider that has been looked up for every anime and lists `units` for each. */
const provider = (id: string, locale: string, units: ProviderUnit[], listsLanguages = true): FakeProvider => ({
  id,
  locale,
  listsLanguages,
  units: () => units,
  ask: async () => units
});

/**
 * A provider that has not been looked up for any anime yet, and answers
 * `answer` when asked, or fails without one.
 */
const notLookedUp = (id: string, locale: string, answer?: ProviderUnit[]): FakeProvider => ({
  ...provider(id, locale, []),
  units: () => undefined,
  ask: async () => {
    if (!answer) {
      throw new Error(`${id} is down`);
    }

    return answer;
  }
});

const firstEpisode = [
  {
    anilistId: 1,
    episode: 1
  }
];

beforeEach(() => {
  useProviders([]);
  anilistEpisode = 3;
  queuedLookups = [];
  asks = 0;
});

describe("versionsOffered", () => {
  test("offers each language a provider lists, in the provider's locale", () => {
    expect(versionsOffered([listed("en", ["sub", "dub"])])).toEqual([
      {
        language: "sub",
        locale: "en"
      },
      {
        language: "dub",
        locale: "en"
      }
    ]);
  });

  test("gives raw no locale, since it has neither dubbed audio nor subtitles", () => {
    expect(versionsOffered([listed("en", ["raw"])])).toEqual([
      {
        language: "raw",
        locale: null
      }
    ]);
  });

  test("merges providers, keeping one entry per language and locale", () => {
    expect(
      versionsOffered([
        listed("en", ["sub"]),
        listed("pt-BR", ["dub", "sub"]),
        listed("en", ["sub", "dub", "raw"]),
        listed("pt-BR", ["raw"])
      ])
    ).toEqual([
      {
        language: "sub",
        locale: "en"
      },
      {
        language: "sub",
        locale: "pt-BR"
      },
      {
        language: "dub",
        locale: "en"
      },
      {
        language: "dub",
        locale: "pt-BR"
      },
      {
        language: "raw",
        locale: null
      }
    ]);
  });

  test("ignores providers whose lists claim every language", () => {
    expect(versionsOffered([listed("en", ["sub", "dub"], false)])).toEqual([]);
  });

  test("ignores a unit that does not say which languages it has", () => {
    expect(versionsOffered([listed("en", null)])).toEqual([]);
  });
});

describe("languagesOf", () => {
  test("drops locales and keeps each language once, in order", () => {
    expect(
      languagesOf([
        {
          language: "sub",
          locale: "en"
        },
        {
          language: "sub",
          locale: "pt-BR"
        },
        {
          language: "dub",
          locale: "pt-BR"
        }
      ])
    ).toEqual(["sub", "dub"]);
  });
});

describe("fillerOf", () => {
  const listedAs = (isFiller: boolean | null): ListedUnit => ({
    source: {
      locale: "en",
      listsLanguages: true
    },
    unit: unit(1, ["sub"], isFiller)
  });

  test("calls an episode filler when any provider does", () => {
    expect(fillerOf([listedAs(false), listedAs(true)])).toBe(true);
  });

  test("calls an episode not filler when every provider that says agrees", () => {
    expect(fillerOf([listedAs(null), listedAs(false)])).toBe(false);
  });

  test("does not know when no provider says", () => {
    expect(fillerOf([listedAs(null)])).toBeNull();
    expect(fillerOf([])).toBeNull();
  });
});

describe("getEpisodeVersions", () => {
  test("combines the providers that list the AniList episode", async () => {
    useProviders([
      provider("anikoto", "en", [unit(3, ["sub", "dub"])]),
      provider("megaplay", "en", [unit(3, ["sub", "dub"])], false),
      provider("allmanga", "en", [unit(3, ["sub", "raw"]), unit(4, ["dub"])]),
      provider("brazilian", "pt-BR", [unit(3, ["dub"])])
    ]);

    expect(await getEpisodeVersions("season", 3)).toEqual([
      {
        language: "sub",
        locale: "en"
      },
      {
        language: "dub",
        locale: "en"
      },
      {
        language: "dub",
        locale: "pt-BR"
      },
      {
        language: "raw",
        locale: null
      }
    ]);
    expect(queuedLookups).toEqual([]);
  });

  test("lists what is stored and queues the lookup when a provider is not looked up yet", async () => {
    useProviders([provider("anikoto", "en", [unit(3, ["sub"])]), notLookedUp("allmanga", "en")]);

    expect(await getEpisodeVersions("season", 3)).toEqual([
      {
        language: "sub",
        locale: "en"
      }
    ]);
    expect(queuedLookups).toEqual([154587]);
  });

  test("returns nothing when no provider lists the episode", async () => {
    useProviders([provider("anikoto", "en", [unit(1, ["sub", "dub"])])]);

    expect(await getEpisodeVersions("season", 3)).toEqual([]);
  });
});

describe("findEpisodeListings", () => {
  test("marks each episode filler or not, as the providers that say do", async () => {
    useProviders([
      provider("anikoto", "en", [unit(1, ["sub"], false), unit(2, ["sub"], true)]),
      provider("silent", "en", [unit(1, ["dub"]), unit(2, ["dub"]), unit(3, ["dub"])])
    ]);

    const found = await findEpisodeListings(
      [1, 2, 3].map((episode) => ({
        anilistId: 1,
        episode
      }))
    );

    expect(Object.fromEntries([...found].map(([key, listing]) => [key, listing.isFiller]))).toEqual({
      "1:1": false,
      "1:2": true,
      "1:3": null
    });
  });

  test("does not know whether an episode is filler while it is unknown", async () => {
    useProviders([notLookedUp("anikoto", "en")]);

    expect((await findEpisodeListings(firstEpisode)).get("1:1")).toEqual({
      languages: null,
      isFiller: null
    });
  });
});

describe("findEpisodeLanguages", () => {
  test("lists each episode's languages, keyed by AniList episode", async () => {
    useProviders([
      provider("anikoto", "en", [unit(1, ["sub", "dub"]), unit(2, ["sub"])]),
      provider("brazilian", "pt-BR", [unit(2, ["dub"])])
    ]);

    const found = await findEpisodeLanguages(
      [1, 2, 3].map((episode) => ({
        anilistId: 1,
        episode
      }))
    );

    expect(Object.fromEntries(found)).toEqual({
      "1:1": ["sub", "dub"],
      "1:2": ["sub", "dub"],
      "1:3": []
    });
  });

  test("marks an anime's episodes unknown until it is looked up, queueing its lookup, and keeps others", async () => {
    useProviders([
      {
        ...provider("anikoto", "en", []),
        units: (anilistId) => (anilistId === 1 ? [unit(1, ["sub", "dub"])] : undefined),
        ask: async () => {
          throw new Error("AniKoto is down");
        }
      }
    ]);

    const found = await findEpisodeLanguages([
      {
        anilistId: 1,
        episode: 1
      },
      {
        anilistId: 2,
        episode: 1
      }
    ]);

    expect(Object.fromEntries(found)).toEqual({
      "1:1": ["sub", "dub"],
      "2:1": null
    });
    expect(queuedLookups).toEqual([2]);
  });

  test("looks an anime no provider was looked up for up on the spot", async () => {
    useProviders([notLookedUp("anikoto", "en", [unit(1, ["sub"])]), notLookedUp("allmanga", "en", [unit(1, ["dub"])])]);

    expect((await findEpisodeLanguages(firstEpisode)).get("1:1")).toEqual(["sub", "dub"]);
    expect(asks).toBe(2);
    expect(queuedLookups).toEqual([]);
  });

  test("leaves providers that fail the first lookup to the scheduler", async () => {
    useProviders([notLookedUp("anikoto", "en", [unit(1, ["sub"])]), notLookedUp("allmanga", "en")]);

    expect((await findEpisodeLanguages(firstEpisode)).get("1:1")).toEqual(["sub"]);
    expect(queuedLookups).toEqual([1]);
  });

  test("asks no provider once any has been looked up", async () => {
    useProviders([provider("anikoto", "en", [unit(1, ["sub"])]), notLookedUp("allmanga", "en", [unit(1, ["dub"])])]);

    expect((await findEpisodeLanguages(firstEpisode)).get("1:1")).toEqual(["sub"]);
    expect(asks).toBe(0);
    expect(queuedLookups).toEqual([1]);
  });

  test("shares one first lookup between concurrent listings", async () => {
    useProviders([notLookedUp("anikoto", "en", [unit(1, ["sub"])])]);

    await Promise.all([findEpisodeLanguages(firstEpisode), findEpisodeLanguages(firstEpisode)]);

    expect(asks).toBe(1);
  });

  test("uses the providers looked up so far when another has not been", async () => {
    useProviders([provider("anikoto", "en", [unit(1, ["sub"])]), notLookedUp("slow", "en")]);

    expect((await findEpisodeLanguages(firstEpisode)).get("1:1")).toEqual(["sub"]);
  });

  test("marks an episode unknown, not unwatchable, when only a provider not looked up yet might list it", async () => {
    useProviders([provider("anikoto", "en", []), notLookedUp("slow", "en")]);

    expect((await findEpisodeLanguages(firstEpisode)).get("1:1")).toBeNull();
  });

  test("knows an episode is unwatchable once every provider is looked up without listing it", async () => {
    useProviders([provider("anikoto", "en", []), provider("allmanga", "en", [])]);

    expect((await findEpisodeLanguages(firstEpisode)).get("1:1")).toEqual([]);
    expect(queuedLookups).toEqual([]);
  });

  test("ignores providers whose lists do not say which languages episodes have", async () => {
    useProviders([
      provider("anikoto", "en", [unit(1, ["sub"])]),
      {
        ...notLookedUp("megaplay", "en"),
        listsLanguages: false
      }
    ]);

    expect((await findEpisodeLanguages(firstEpisode)).get("1:1")).toEqual(["sub"]);
    expect(queuedLookups).toEqual([]);
  });
});
