import { describe, expect, test } from "bun:test";

import { hour, minute } from "../../time";
import { maximumReleaseAttempts, planNextCheck, type AiringState } from "./airing-plan";

const now = new Date("2026-09-23T12:00:00Z");

function state(overrides: Partial<AiringState>): AiringState {
  return {
    status: "RELEASING",
    nextAiringAt: null,
    latestAiredEpisode: null,
    latestReleasedEpisode: null,
    startDate: null,
    ...overrides
  };
}

const fresh = {
  awaitedEpisode: null,
  attempt: 0
};

describe("planNextCheck", () => {
  test("checks at the next broadcast when every aired episode is released", () => {
    const nextAiringAt = new Date("2026-09-25T08:00:00Z");
    const plan = planNextCheck(
      state({
        nextAiringAt,
        latestAiredEpisode: 5,
        latestReleasedEpisode: 5
      }),
      fresh,
      now
    );

    expect(plan).toEqual({
      done: false,
      runAt: nextAiringAt,
      awaitedEpisode: null,
      attempt: 0
    });
  });

  test("retries soon after a broadcast when no provider has the episode yet", () => {
    const plan = planNextCheck(
      state({
        nextAiringAt: new Date("2026-09-30T08:00:00Z"),
        latestAiredEpisode: 6,
        latestReleasedEpisode: 5
      }),
      fresh,
      now
    );

    expect(plan).toEqual({
      done: false,
      runAt: new Date(now.getTime() + 15 * minute),
      awaitedEpisode: 6,
      attempt: 0
    });
  });

  test("backs off while the same episode stays missing", () => {
    const plan = planNextCheck(
      state({
        nextAiringAt: new Date("2026-09-30T08:00:00Z"),
        latestAiredEpisode: 6,
        latestReleasedEpisode: 5
      }),
      {
        awaitedEpisode: 6,
        attempt: 2
      },
      now
    );

    expect(plan).toMatchObject({
      runAt: new Date(now.getTime() + 2 * hour),
      attempt: 3
    });
  });

  test("stops retrying an episode after the last attempt but keeps the broadcast check", () => {
    const nextAiringAt = new Date("2026-09-30T08:00:00Z");
    const plan = planNextCheck(
      state({
        nextAiringAt,
        latestAiredEpisode: 6,
        latestReleasedEpisode: 5
      }),
      {
        awaitedEpisode: 6,
        attempt: maximumReleaseAttempts - 1
      },
      now
    );

    expect(plan).toMatchObject({
      runAt: nextAiringAt
    });
  });

  test("ends once a finished anime has every episode", () => {
    const plan = planNextCheck(
      state({
        status: "FINISHED",
        latestAiredEpisode: 12,
        latestReleasedEpisode: 12
      }),
      fresh,
      now
    );

    expect(plan).toEqual({
      done: true
    });
  });

  test("keeps waiting for the final episode of a finished anime, then gives up", () => {
    const finale = state({
      status: "FINISHED",
      latestAiredEpisode: 12,
      latestReleasedEpisode: 11
    });

    expect(planNextCheck(finale, fresh, now)).toMatchObject({
      done: false,
      awaitedEpisode: 12
    });
    expect(
      planNextCheck(
        finale,
        {
          awaitedEpisode: 12,
          attempt: maximumReleaseAttempts - 1
        },
        now
      )
    ).toEqual({
      done: true
    });
  });

  test("waits for premiere day, in Japan time, when AniList has a date but no time", () => {
    const plan = planNextCheck(
      state({
        status: "NOT_YET_RELEASED",
        startDate: "2026-10-05"
      }),
      fresh,
      now
    );

    expect(plan).toMatchObject({
      runAt: new Date("2026-10-04T15:00:00Z")
    });
  });

  test("checks every 20 minutes during premiere day", () => {
    const duringPremiere = new Date("2026-10-05T03:00:00Z");
    const plan = planNextCheck(
      state({
        status: "NOT_YET_RELEASED",
        startDate: "2026-10-05"
      }),
      fresh,
      duringPremiere
    );

    expect(plan).toMatchObject({
      runAt: new Date(duringPremiere.getTime() + 20 * minute)
    });
  });

  test("uses the announced premiere time over the premiere-day window", () => {
    // Psyren: AniList lists episode 1 for 2026-10-05 23:00 JST.
    const nextAiringAt = new Date(1_791_208_800_000);
    const plan = planNextCheck(
      state({
        status: "NOT_YET_RELEASED",
        startDate: "2026-10-05",
        nextAiringAt
      }),
      fresh,
      now
    );

    expect(plan).toMatchObject({
      runAt: nextAiringAt
    });
  });

  test("checks daily when an upcoming anime only has a month", () => {
    const plan = planNextCheck(
      state({
        status: "NOT_YET_RELEASED",
        startDate: "2027-01"
      }),
      fresh,
      now
    );

    expect(plan).toMatchObject({
      runAt: new Date("2026-09-24T12:00:00Z")
    });
  });

  test("checks again shortly when AniList's broadcast time has already passed", () => {
    const plan = planNextCheck(
      state({
        nextAiringAt: new Date(now.getTime() - minute),
        latestAiredEpisode: 4,
        latestReleasedEpisode: 4
      }),
      fresh,
      now
    );

    expect(plan).toMatchObject({
      runAt: new Date(now.getTime() + 20 * minute)
    });
  });
});
