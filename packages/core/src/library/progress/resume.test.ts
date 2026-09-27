import { describe, expect, test } from "bun:test";

import { completedSeasons, continuePoint, seasonStanding, unstartedSeason, watchStatus, type EpisodeProgress, type TitleEpisode } from "./resume";

/** A finished season of `count` released episodes, released at `releasedAt` when given. */
function season(seasonId: string, count: number, inWatchOrder = true, releasedAt: string | null = null): TitleEpisode[] {
  return Array.from({
    length: count,
  }, (_, index) => ({
    seasonId,
    inWatchOrder,
    number: index + 1,
    isExtra: false,
    isReleased: true,
    releasedAt,
    isFinale: index === count - 1,
  }));
}

const checkpoint = (
  seasonId: string,
  episode: number,
  positionSeconds: number,
  completed: boolean,
  eventAt = "2026-01-01T00:00:00.000Z"
): EpisodeProgress => ({
  seasonId,
  episode,
  positionSeconds,
  durationSeconds: 1440,
  completed,
  eventAt,
});

/** Every episode of a season watched, the last one latest, all at `eventAt`. */
const watchedSeason = (seasonId: string, count: number, eventAt = "2026-01-01T00:00:00.000Z") =>
  Array.from({
    length: count,
  }, (_, index) => checkpoint(seasonId, count - index, 1440, true, eventAt));

// Frieren, reduced: two seasons of three episodes and a one-episode OVA.
const frieren = [
  ...season("s1", 3),
  ...season("s2", 3),
  ...season("ova1", 1, false)
];

describe("continuePoint", () => {
  test("resumes an unfinished episode where it stopped", () => {
    expect(continuePoint(frieren, [checkpoint("s1", 2, 600, false)])).toEqual({
      seasonId: "s1",
      episode: 2,
      positionSeconds: 600,
      durationSeconds: 1440,
    });
  });

  test("starts the next episode after a completed one", () => {
    expect(continuePoint(frieren, [checkpoint("s1", 2, 1400, true)])).toEqual({
      seasonId: "s1",
      episode: 3,
      positionSeconds: 0,
      durationSeconds: null,
    });
  });

  test("continues from the last episode of a season into the next season", () => {
    expect(continuePoint(frieren, [checkpoint("s1", 3, 1400, true)])).toMatchObject({
      seasonId: "s2",
      episode: 1,
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
      durationSeconds: 1440,
    });
  });

  test("skips extras that cannot be played", () => {
    const withRecap = [
      ...season("s1", 2),
      {
        seasonId: "s1",
        inWatchOrder: true,
        number: 3,
        isExtra: true,
        isReleased: true,
        releasedAt: null,
        isFinale: false,
      },
      ...season("s2", 1)
    ];

    expect(continuePoint(withRecap, [checkpoint("s1", 2, 1400, true)])).toMatchObject({
      seasonId: "s2",
      episode: 1,
    });
  });

  test("waits while the next episode has not aired", () => {
    const airing = [
      ...season("s1", 2),
      {
        ...season("s1", 3)[2]!,
        isReleased: false,
      }
    ];

    expect(continuePoint(airing, [checkpoint("s1", 1, 1400, true)])?.episode).toBe(2);
    expect(continuePoint(airing, [checkpoint("s1", 2, 1400, true)])).toBeNull();
  });

  test("gives up on an episode the title no longer lists", () => {
    expect(continuePoint(frieren, [checkpoint("gone", 1, 1400, true)])).toBeNull();
  });

  test("does not push a season released after the last one was finished", () => {
    const later = [
      ...season("s1", 2),
      ...season("s2", 2, true, "2026-06-01T00:00:00.000Z")
    ];

    expect(continuePoint(later, [checkpoint("s1", 2, 1400, true, "2026-01-01T00:00:00.000Z")])).toBeNull();
    expect(continuePoint(later, [checkpoint("s1", 2, 1400, true, "2026-07-01T00:00:00.000Z")])).toMatchObject({
      seasonId: "s2",
      episode: 1,
    });
  });

  test("follows a new episode of the season being watched whenever it airs", () => {
    const weekly = [
      ...season("s1", 1),
      ...season("s1", 2, true, "2026-06-01T00:00:00.000Z").slice(1)
    ];

    expect(continuePoint(weekly, [checkpoint("s1", 1, 1400, true, "2026-01-01T00:00:00.000Z")])).toMatchObject({
      seasonId: "s1",
      episode: 2,
    });
  });
});

describe("completedSeasons", () => {
  test("lists a season once its finale is watched", () => {
    expect(completedSeasons(frieren, [checkpoint("s1", 3, 1400, true)])).toEqual([
      {
        seasonId: "s1",
        completedAt: "2026-01-01T00:00:00.000Z",
      }
    ]);
  });

  test("does not complete a season still airing", () => {
    const airing = season("s1", 3).map((episode) => ({
      ...episode,
      isFinale: false,
    }));

    expect(completedSeasons(airing, [checkpoint("s1", 3, 1400, true)])).toEqual([]);
  });
});

describe("watchStatus", () => {
  test("is planning before anything is played", () => {
    expect(watchStatus(frieren, [], false)).toBe("planning");
  });

  test("is watching part-way through a season", () => {
    expect(watchStatus(frieren, [checkpoint("s1", 2, 1400, true)], false)).toBe("watching");
  });

  test("is watching after a season while the next one was already out", () => {
    expect(watchStatus(frieren, watchedSeason("s1", 3), false)).toBe("watching");
  });

  test("is completed once every started season is finished", () => {
    expect(watchStatus(frieren, [
      ...watchedSeason("s2", 3),
      ...watchedSeason("s1", 3)
    ], false)).toBe("completed");
  });

  test("stays completed when a season is released later", () => {
    const later = [
      ...season("s1", 2),
      ...season("s2", 2, true, "2026-06-01T00:00:00.000Z")
    ];

    expect(watchStatus(later, watchedSeason("s1", 2), false)).toBe("completed");
    expect(unstartedSeason(later, watchedSeason("s1", 2))).toBe("s2");
  });

  test("is watching again once the new season is started", () => {
    const later = [
      ...season("s1", 2),
      ...season("s2", 2, true, "2026-06-01T00:00:00.000Z")
    ];

    expect(watchStatus(later, [
      checkpoint("s2", 1, 300, false, "2026-07-01T00:00:00.000Z"),
      ...watchedSeason("s1", 2)
    ], false)).toBe("watching");
  });

  test("is dropped when the user says so, whatever was watched", () => {
    expect(watchStatus(frieren, watchedSeason("s1", 3), true)).toBe("dropped");
  });
});

describe("seasonStanding", () => {
  test("counts the watched episodes of the season to continue", () => {
    expect(seasonStanding(frieren, [
      checkpoint("s1", 2, 1400, true),
      checkpoint("s1", 1, 1400, true)
    ])).toEqual({
      seasonId: "s1",
      episode: 3,
      watchedEpisodes: 2,
      releasedEpisodes: 3,
    });
  });

  test("keeps the last season played once there is nothing to continue", () => {
    expect(seasonStanding(frieren, watchedSeason("s2", 3))).toEqual({
      seasonId: "s2",
      episode: null,
      watchedEpisodes: 3,
      releasedEpisodes: 3,
    });
  });
});
