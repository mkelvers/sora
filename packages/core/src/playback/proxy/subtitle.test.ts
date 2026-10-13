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
			{
				from: 0,
				offset: 0.5,
			},
			{
				from: 90,
				offset: -60,
			},
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
		expect(
			retimeWebVtt(vtt, [
				{
					from: 0,
					offset: -60,
				},
			]),
		).toBe(`WEBVTT

2
00:00:40.000 --> 00:00:42.250 line:90%
<i>After it</i>`);
	});

	describe("with anchors", () => {
		const anchors = [
			{
				start: 1,
				end: 3.5,
				movedStart: 11.6,
				movedEnd: 12.4,
			},
		];

		test("puts a cue where its anchor says, instead of shifting it", () => {
			const shifts = [
				{
					from: 0,
					offset: 10,
				},
			];

			expect(retimeWebVtt(vtt, shifts, anchors)).toBe(`WEBVTT

1
00:00:11.600 --> 00:00:12.400
Before the opening

2
00:01:50.000 --> 00:01:52.250 line:90%
<i>After it</i>`);
		});

		test("puts the same line in another language where the anchor says, though it is timed a little differently", () => {
			const german = `WEBVTT

00:00:01.100 --> 00:00:03.300
Vor dem Vorspann`;

			expect(
				retimeWebVtt(
					german,
					[
						{
							from: 0,
							offset: 10,
						},
					],
					anchors,
				),
			).toBe(`WEBVTT

00:00:11.600 --> 00:00:12.400
Vor dem Vorspann`);
		});

		test("shifts a cue that overlaps an anchor's cue only in passing", () => {
			const other = `WEBVTT

00:00:03.300 --> 00:00:06.000
Next line`;

			expect(
				retimeWebVtt(
					other,
					[
						{
							from: 0,
							offset: 10,
						},
					],
					anchors,
				),
			).toBe(`WEBVTT

00:00:13.300 --> 00:00:16.000
Next line`);
		});
	});
});
