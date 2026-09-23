import { describe, expect, test } from "bun:test";

import { assignSeasonIds, type StoredSeason } from "./identity";
import type { SeasonKind } from "./seasons";

/** A laid-out season reduced to what identifies it. */
function season(kind: SeasonKind, number: number, anilistIds: number[]) {
  return {
    kind,
    number,
    anime: anilistIds.map((id) => ({
      id
    }))
  };
}

function stored(id: string, kind: SeasonKind, number: number, anchorAnilistId: number | null): StoredSeason {
  return {
    id,
    kind,
    number,
    anchorAnilistId
  };
}

function idsFor(storedSeasons: StoredSeason[], seasons: ReturnType<typeof season>[]) {
  let next = 0;
  return assignSeasonIds(storedSeasons, seasons, () => `new${++next}`).map(({ id }) => id);
}

describe("assignSeasonIds", () => {
  const tensura = [
    stored("s1", "season", 1, 101),
    stored("s2", "season", 2, 201),
    stored("ova1", "ova", 1, 901)
  ];

  test("keeps every ID and adds one for a new season", () => {
    expect(
      idsFor(tensura, [
        season("season", 1, [101]),
        season("season", 2, [201]),
        season("season", 3, [301]),
        season("ova", 1, [901])
      ])
    ).toEqual([
      "s1",
      "s2",
      "new1",
      "ova1"
    ]);
  });

  test("keeps a season's ID when a later part is merged into it", () => {
    expect(
      idsFor(tensura, [
        season("season", 1, [101]),
        season("season", 2, [201, 202]),
        season("ova", 1, [901])
      ])
    ).toEqual([
      "s1",
      "s2",
      "ova1"
    ]);
  });

  test("passes a season's ID on when an earlier part is merged in front", () => {
    expect(
      idsFor([stored("s2", "season", 2, 202)], [
        season("season", 2, [201, 202])
      ])
    ).toEqual(["s2"]);
  });

  test("keeps IDs when seasons are renumbered", () => {
    expect(
      idsFor(tensura, [
        season("season", 1, [101]),
        season("season", 2, [150]),
        season("season", 3, [201])
      ])
    ).toEqual([
      "s1",
      "new1",
      "s2"
    ]);
  });

  test("matches a season of TMDB extras by kind and number", () => {
    expect(
      idsFor([stored("extras", "season", 1, null)], [
        season("season", 1, [])
      ])
    ).toEqual(["extras"]);
  });

  test("uses each stored ID once", () => {
    expect(
      idsFor([stored("s1", "season", 1, 101)], [
        season("season", 1, [101]),
        season("season", 2, [101])
      ])
    ).toEqual([
      "s1",
      "new1"
    ]);
  });
});
