import { describe, expect, mock, test } from "bun:test";

mock.module("../../database/client", () => ({
  db: {}
}));

const { normalizeTitle, popularityWeight, rankCandidates, searchText, titleScore } = await import("./search");

/** An indexed entry with the fields ranking reads. */
function entry(anilistId: number, popularity: number, titles: { english?: string; romaji?: string; native?: string; synonyms?: string[] }) {
  return {
    anilistId,
    popularity,
    english: titles.english ?? null,
    romaji: titles.romaji ?? null,
    native: titles.native ?? null,
    synonyms: titles.synonyms ?? []
  };
}

// Titles and popularity as AniList lists them.
const kimetsu = entry(101922, 1_000_000, {
  english: "Demon Slayer: Kimetsu no Yaiba",
  romaji: "Kimetsu no Yaiba",
  native: "鬼滅の刃"
});
const mugenTrain = entry(112151, 420_000, {
  english: "Demon Slayer -Kimetsu no Yaiba- The Movie: Mugen Train",
  romaji: "Kimetsu no Yaiba Movie: Mugen Ressha-hen"
});
const onigiri = entry(21612, 9_026, {
  english: "Onigiri",
  romaji: "Onigiri",
  native: "鬼斬",
  synonyms: ["Demon Slayer", "Demon Cutter"]
});
const attackOnTitan = entry(16498, 1_100_000, {
  english: "Attack on Titan",
  romaji: "Shingeki no Kyojin",
  native: "進撃の巨人",
  synonyms: ["AoT", "SnK"]
});
const jujutsuKaisen = entry(113415, 900_000, {
  english: "JUJUTSU KAISEN",
  romaji: "Jujutsu Kaisen",
  native: "呪術廻戦",
  synonyms: ["JJK", "Sorcery Fight"]
});
const jujutsuKaisenZero = entry(131573, 400_000, {
  english: "JUJUTSU KAISEN 0",
  romaji: "Jujutsu Kaisen 0: Jujutsu Kaisen Zero"
});

const top = (query: string, candidates: ReturnType<typeof entry>[]) => rankCandidates(query, candidates)[0]?.anilistId;

describe("rankCandidates", () => {
  test("puts the famous show before an obscure title whose synonym is the query", () => {
    expect(top("demon slayer", [onigiri, mugenTrain, kimetsu])).toBe(101922);
  });

  test("still finds the obscure title by its own name", () => {
    expect(top("onigiri", [kimetsu, onigiri])).toBe(21612);
  });

  test("puts a show before its film when both start with the query", () => {
    expect(top("demon slayer kimetsu no yaiba", [mugenTrain, kimetsu])).toBe(101922);
  });

  test("matches romaji, native, and English titles alike", () => {
    expect(top("shingeki no kyojin", [jujutsuKaisen, attackOnTitan])).toBe(16498);
    expect(top("進撃の巨人", [jujutsuKaisen, attackOnTitan])).toBe(16498);
  });

  test("matches an abbreviation listed as a synonym", () => {
    expect(top("jjk", [attackOnTitan, jujutsuKaisenZero, jujutsuKaisen])).toBe(113415);
  });

  test("forgives a typo", () => {
    expect(top("jujutsu kaisn", [attackOnTitan, jujutsuKaisen])).toBe(113415);
    expect(top("demon slayr", [onigiri, kimetsu])).toBe(101922);
  });

  test("finds the far more popular remake when both have the query as their title", () => {
    const original = entry(136, 135_064, {
      english: "Hunter x Hunter",
      romaji: "HUNTER×HUNTER"
    });
    const remake = entry(11061, 843_439, {
      english: "Hunter x Hunter (2011)",
      romaji: "HUNTER×HUNTER (2011)"
    });

    expect(top("hunter x hunter", [original, remake])).toBe(11061);
  });

  test("lets a far more popular show that contains the query beat a film that starts with it", () => {
    const evangelion = entry(30, 496_647, {
      english: "Neon Genesis Evangelion",
      romaji: "Shin Seiki Evangelion"
    });
    const rebuild = entry(2759, 145_336, {
      english: "Evangelion: 1.0 You Are (Not) Alone",
      romaji: "Evangelion Shin Movie: Jo"
    });

    expect(top("evangelion", [rebuild, evangelion])).toBe(30);
  });

  test("still prefers an exact title to a slightly more popular sequel", () => {
    const clannad = entry(2167, 300_000, {
      english: "Clannad",
      romaji: "CLANNAD"
    });
    const afterStory = entry(4181, 350_000, {
      english: "Clannad: After Story",
      romaji: "CLANNAD: AFTER STORY"
    });

    expect(top("clannad", [afterStory, clannad])).toBe(2167);
  });

  test("ignores punctuation and spacing", () => {
    const reZero = entry(21355, 700_000, {
      english: "Re:ZERO -Starting Life in Another World-",
      romaji: "Re:Zero kara Hajimeru Isekai Seikatsu"
    });

    expect(top("re zero", [onigiri, reZero])).toBe(21355);
    expect(top("rezero", [onigiri, reZero])).not.toBe(21612);
  });
});

describe("titleScore", () => {
  test("ranks an exact title over a prefix, a prefix over contained words, and those over a resemblance", () => {
    const exact = titleScore("one piece", "one piece");
    const prefix = titleScore("one piece", "one piece film red");
    const words = titleScore("one piece", "the one piece");
    const resembling = titleScore("one peice", "one piece");

    expect(exact).toBe(1);
    expect(prefix).toBeLessThan(exact);
    expect(words).toBeLessThan(prefix);
    expect(resembling).toBeLessThan(words);
    expect(resembling).toBeGreaterThan(0.4);
  });

  test("does not take a word that merely shares letters with the query for a typo", () => {
    expect(titleScore("frieren", "one piece episode of merry the tale of one more friend")).toBe(0);
    expect(titleScore("frieren", "my deer friend nokotan")).toBe(0);
    expect(titleScore("frieran", "sousou no frieren")).toBeGreaterThan(0.5);
  });

  test("matches initials of a title of several words", () => {
    expect(titleScore("aot", "attack on titan")).toBe(0.85);
    expect(titleScore("aot", "attack")).toBeLessThan(0.85);
  });
});

describe("popularityWeight", () => {
  test("grows with popularity, from 0.4 to 1", () => {
    expect(popularityWeight(0)).toBe(0.4);
    expect(popularityWeight(9_026)).toBeLessThan(popularityWeight(1_000_000));
    expect(popularityWeight(5_000_000)).toBe(1);
  });
});

describe("normalizeTitle", () => {
  test("drops accents and punctuation and reads × as x", () => {
    expect(normalizeTitle("Pokémon")).toBe("pokemon");
    expect(normalizeTitle("SPY×FAMILY")).toBe("spy x family");
    expect(normalizeTitle("Steins;Gate")).toBe("steins gate");
  });
});

describe("searchText", () => {
  test("holds every distinct title and the initials of the longer ones", () => {
    expect(searchText(["Attack on Titan", "Shingeki no Kyojin", "Attack on Titan", null])).toBe(
      "attack on titan | shingeki no kyojin | aot | snk"
    );
  });
});
