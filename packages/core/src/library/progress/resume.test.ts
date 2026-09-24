import { describe, expect, test } from "bun:test";

import type { SeasonKind } from "../../series/seasons";
import { continuePoint, type EpisodeProgress, type TitleEpisode } from "./resume";

/** A season of `count` released episodes. */
function season(seasonId: string, count: number, seasonKind: SeasonKind = "season"): TitleEpisode[] {
  return Array.from({ length: count }, (_, index) => ({
    seasonId,
    seasonKind,
    number: index + 1,
    isExtra: false,
    isReleased: true
  }));
}

const checkpoint = (seasonId: string, episode: number, positionSeconds: number, completed: boolean): EpisodeProgress => ({
  seasonId,
  episode,
  positionSeconds,
  durationSeconds: 1440,
  completed,
  eventAt: "2026-01-01T00:00:00.000Z"
});

// Frieren, reduced: two seasons of three episodes and a one-episode OVA.
const frieren = [
  ...season("s1", 3),
  ...season("s2", 3),
  ...season("ova1", 1, "ova")
];

describe("continuePoint", () => {
  test("resumes an unfinished episode where it stopped", () => {
    expect(continuePoint(frieren, [checkpoint("s1", 2, 600, false)])).toEqual({
      seasonId: "s1",
      episode: 2,
      positionSeconds: 600,
      durationSeconds: 1440
    });
  });

  test("starts the next episode after a completed one", () => {
    expect(continuePoint(frieren, [checkpoint("s1", 2, 1400, true)])).toEqual({
      seasonId: "s1",
      episode: 3,
      positionSeconds: 0,
      durationSeconds: null
    });
  });

  test("continues from the last episode of a season into the next season", () => {
    expect(continuePoint(frieren, [checkpoint("s1", 3, 1400, true)])).toMatchObject({
      seasonId: "s2",
      episode: 1
    });
  });

  test("does not continue from the last regular season into the OVAs", () => {
    expect(continuePoint(frieren, [checkpoint("s2", 3, 1400, true)])).toBeNull();
  });

  test("resumes the next episode from its own checkpoint", () => {
    expect(
      continuePoint(frieren, [
        checkpoint("s1", 3, 1400, true),
        checkpoint("s2", 1, 300, false)
      ])
    ).toEqual({
      seasonId: "s2",
      episode: 1,
      positionSeconds: 300,
      durationSeconds: 1440
    });
  });

  test("skips extras that cannot be played", () => {
    const withRecap = [
      ...season("s1", 2),
      {
        seasonId: "s1",
        seasonKind: "season" as const,
        number: 3,
        isExtra: true,
        isReleased: true
      },
      ...season("s2", 1)
    ];

    expect(continuePoint(withRecap, [checkpoint("s1", 2, 1400, true)])).toMatchObject({
      seasonId: "s2",
      episode: 1
    });
  });

  test("waits while the next episode has not aired", () => {
    const airing = [
      ...season("s1", 2),
      {
        ...season("s1", 3)[2]!,
        isReleased: false
      }
    ];

    expect(continuePoint(airing, [checkpoint("s1", 1, 1400, true)])?.episode).toBe(2);
    expect(continuePoint(airing, [checkpoint("s1", 2, 1400, true)])).toBeNull();
  });

  test("gives up on an episode the title no longer lists", () => {
    expect(continuePoint(frieren, [checkpoint("gone", 1, 1400, true)])).toBeNull();
  });
});
