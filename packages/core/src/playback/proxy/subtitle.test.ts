import { describe, expect, test } from "bun:test";

import { retimeWebVtt } from "./subtitle";

const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:03.500
Before the opening

2
01:40.000 --> 01:42.250 line:90%
<i>After it</i>`;

describe("retimeWebVtt", () => {
  test("moves each cue by the shift at its start, keeping its length and settings", () => {
    const shifts = [
      { from: 0, offset: 0.5 },
      { from: 90, offset: -60 }
    ];

    expect(retimeWebVtt(vtt, shifts)).toBe(`WEBVTT

1
00:00:01.500 --> 00:00:04.000
Before the opening

2
00:00:40.000 --> 00:00:42.250 line:90%
<i>After it</i>`);
  });

  test("drops cues that would start before the video", () => {
    expect(retimeWebVtt(vtt, [{ from: 0, offset: -60 }])).toBe(`WEBVTT

2
00:00:40.000 --> 00:00:42.250 line:90%
<i>After it</i>`);
  });
});
