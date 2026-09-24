import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { ContentLanguage } from "anime-sdk";

import type { ProviderUnit } from "./episodes";
import type { ListedUnit } from "./versions";

/** A provider stand-in: its ID, what it serves, and its episode list. */
interface FakeProvider {
  id: string;
  locale: string;
  listsLanguages: boolean;
  units: (anilistId: number) => Promise<ProviderUnit[]>;
}

let providers: FakeProvider[] = [];
let anilistEpisode = 3;
let lookups = 0;

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
mock.module("../../catalog/queries/anime", () => ({
  getAnime: async (id: number) => {
    if (id === 404) {
      throw new Error("Anime not found");
    }
    return {
      id
    };
  }
}));
mock.module("./episodes", () => ({
  getProviderUnits: (anime: { id: number }, provider: { id: string }) => {
    lookups += 1;
    return providers.find((candidate) => candidate.id === provider.id)?.units(anime.id);
  }
}));
mock.module("../providers/registry", () => ({
  streamProviders
}));

const { findEpisodeLanguages, getEpisodeVersions, languagesOf, versionsOffered } = await import("./versions");

const unit = (number: number, languages: ContentLanguage[] | null): ProviderUnit => ({
  id: `unit-${number}`,
  number,
  title: `Episode ${number}`,
  languages
});

const listed = (locale: string, languages: ContentLanguage[] | null, listsLanguages = true): ListedUnit => ({
  source: {
    locale,
    listsLanguages
  },
  unit: unit(1, languages)
});

const provider = (id: string, locale: string, units: ProviderUnit[], listsLanguages = true): FakeProvider => ({
  id,
  locale,
  listsLanguages,
  units: async () => units
});

/** A provider that answers only once the test calls the returned `finish`. */
function slowProvider(id: string, locale: string, units: ProviderUnit[]) {
  let finish = () => {};
  const fake: FakeProvider = {
    ...provider(id, locale, []),
    units: () =>
      new Promise((resolve) => {
        finish = () => resolve(units);
      })
  };

  return {
    fake,
    finish: () => finish()
  };
}

const firstEpisode = [
  {
    anilistId: 1,
    episode: 1
  }
];

beforeEach(() => {
  useProviders([]);
  anilistEpisode = 3;
  lookups = 0;
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
  });

  test("leaves out a failing provider", async () => {
    useProviders([
      provider("anikoto", "en", [unit(3, ["sub"])]),
      {
        ...provider("allmanga", "en", []),
        units: async () => {
          throw new Error("AllManga is down");
        }
      }
    ]);

    expect(await getEpisodeVersions("season", 3)).toEqual([
      {
        language: "sub",
        locale: "en"
      }
    ]);
  });

  test("returns nothing when no provider lists the episode", async () => {
    useProviders([provider("anikoto", "en", [unit(1, ["sub", "dub"])])]);

    expect(await getEpisodeVersions("season", 3)).toEqual([]);
  });
});

describe("findEpisodeLanguages", () => {
  test("lists each episode's languages, keyed by AniList episode", async () => {
    useProviders([
      provider("anikoto", "en", [unit(1, ["sub", "dub"]), unit(2, ["sub"])]),
      provider("brazilian", "pt-BR", [unit(2, ["dub"])])
    ]);

    const found = await findEpisodeLanguages(
      [
        {
          anilistId: 1,
          episode: 1
        },
        {
          anilistId: 1,
          episode: 2
        },
        {
          anilistId: 1,
          episode: 3
        }
      ],
      1_000
    );

    expect(Object.fromEntries(found)).toEqual({
      "1:1": ["sub", "dub"],
      "1:2": ["sub", "dub"],
      "1:3": []
    });
  });

  test("marks an anime's episodes unknown when its lookup outlasts the budget, and keeps others", async () => {
    let finishSlow = () => {};
    useProviders([
      {
        ...provider("anikoto", "en", []),
        // Anime 1 answers straight away; anime 2 only once the test lets it.
        units: (anilistId) =>
          anilistId === 1
            ? Promise.resolve([unit(1, ["sub", "dub"])])
            : new Promise((resolve) => {
                finishSlow = () => resolve([unit(1, ["sub"])]);
              })
      }
    ]);

    const found = await findEpisodeLanguages(
      [
        {
          anilistId: 1,
          episode: 1
        },
        {
          anilistId: 2,
          episode: 1
        }
      ],
      20
    );
    finishSlow();

    expect(Object.fromEntries(found)).toEqual({
      "1:1": ["sub", "dub"],
      "2:1": null
    });
  });

  test("uses the providers that answered in time when a slow one still has more to say", async () => {
    const slow = slowProvider("slow", "en", [unit(1, ["dub"])]);
    useProviders([provider("anikoto", "en", [unit(1, ["sub"])]), slow.fake]);

    const found = await findEpisodeLanguages(firstEpisode, 20);
    slow.finish();

    expect(found.get("1:1")).toEqual(["sub"]);
  });

  test("marks an episode unknown, not unwatchable, when only a slow provider might list it", async () => {
    const slow = slowProvider("slow", "en", [unit(1, ["sub"])]);
    useProviders([provider("anikoto", "en", []), slow.fake]);

    const found = await findEpisodeLanguages(firstEpisode, 20);
    slow.finish();

    expect(found.get("1:1")).toBeNull();
  });

  test("counts a failing provider as having answered, so the episode is known to be unwatchable", async () => {
    useProviders([
      provider("anikoto", "en", []),
      {
        ...provider("slow", "en", []),
        units: async () => {
          throw new Error("The slow provider is down");
        }
      }
    ]);

    expect((await findEpisodeLanguages(firstEpisode, 1_000)).get("1:1")).toEqual([]);
  });

  test("shares one lookup per anime and provider between concurrent listings", async () => {
    const slow = slowProvider("anikoto", "en", [unit(1, ["sub", "dub"])]);
    useProviders([slow.fake]);

    const listings = Promise.all([
      findEpisodeLanguages(firstEpisode, 1_000),
      findEpisodeLanguages(firstEpisode, 1_000)
    ]);
    await Bun.sleep(5);
    slow.finish();

    expect((await listings).map((found) => found.get("1:1"))).toEqual([
      ["sub", "dub"],
      ["sub", "dub"]
    ]);
    expect(lookups).toBe(1);
  });

  test("looks a provider up again once its earlier lookup has finished", async () => {
    useProviders([provider("anikoto", "en", [unit(1, ["sub"])])]);

    await findEpisodeLanguages(firstEpisode, 1_000);
    await findEpisodeLanguages(firstEpisode, 1_000);

    expect(lookups).toBe(2);
  });

  test("marks an anime's episodes unknown when the anime cannot be loaded", async () => {
    useProviders([provider("anikoto", "en", [unit(1, ["sub"])])]);

    const found = await findEpisodeLanguages(
      [
        {
          anilistId: 404,
          episode: 1
        }
      ],
      1_000
    );

    expect(found.get("404:1")).toBeNull();
  });
});
