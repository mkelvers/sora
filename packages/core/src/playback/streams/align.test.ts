import { describe, expect, test } from "bun:test";

import { alignTimelines, shiftTime } from "./align";

/** Segment boundaries of a made-up encode: irregular, as scene cuts are. */
function boundaries(seed: number, count = 300) {
  const times = [0];
  let state = seed;
  for (let index = 1; index < count; index++) {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    times.push(times.at(-1)! + 1 + (state % 9_000) / 1_000);
  }
  return times;
}

describe("alignTimelines", () => {
  test("finds a constant offset", () => {
    const sub = boundaries(1);
    const shifts = alignTimelines(sub, sub.map((time) => time + 2.5));

    expect(shifts).toHaveLength(1);
    expect(shifts![0]!.offset).toBeCloseTo(2.5, 2);
  });

  test("changes offset where the other encode adds footage", () => {
    const sub = boundaries(2);
    const cut = sub[150]!;
    const dub = sub.map((time) => (time < cut ? time - 1 : time + 12.4));
    const shifts = alignTimelines(sub, dub)!;

    expect(shifts.map((shift) => [shift.from, Math.round(shift.offset * 10) / 10])).toEqual([
      [0, -1],
      [cut, 12.4]
    ]);
  });

  test("ignores a few stray boundaries", () => {
    const sub = boundaries(3);
    const dub = sub.map((time, index) => (index === 100 || index === 101 ? time + 57 : time));

    expect(alignTimelines(sub, dub)).toEqual([{ from: 0, offset: 0 }]);
  });

  test("refuses encodes of different episodes", () => {
    expect(alignTimelines(boundaries(4), boundaries(5))).toBeNull();
  });
});

describe("shiftTime", () => {
  test("moves a time by the shift it falls in", () => {
    const shifts = [
      { from: 0, offset: -1 },
      { from: 100, offset: 12 }
    ];

    expect(shiftTime(shifts, 50)).toBe(49);
    expect(shiftTime(shifts, 150)).toBe(162);
  });
});
