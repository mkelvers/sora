import { describe, expect, test } from "bun:test";

import { cleanWebVtt, paceWebVtt, retimeWebVtt } from "./subtitle";

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
				end: 3.5,
				movedEnd: 12.4,
				movedStart: 11.6,
				start: 1,
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

describe("cleanWebVtt", () => {
	test("turns ASS escapes in cue text into plain text", () => {
		expect(
			cleanWebVtt(`WEBVTT

1
00:00:01.000 --> 00:00:03.000 line:10%
{\\an8}How I\\N\\h\\h\\h\\hImagine\\N\\h\\h\\h\\h Werewolves

2
00:00:04.000 --> 00:00:05.000
Wait\\h!\\nPlease`),
		).toBe(`WEBVTT

1
00:00:01.000 --> 00:00:03.000 line:10%
How I
Imagine
Werewolves

2
00:00:04.000 --> 00:00:05.000
Wait ! Please`);
	});

	test("restores a file decoded as Windows-1251", () => {
		expect(
			cleanWebVtt(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
NoвЂ” ItвЂ™s в™Є fine рџ\u0098Љ

2
00:00:04.000 --> 00:00:05.000
<b>вЂ” Tempest Star Wolf вЂ”</b>`),
		).toBe(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
No— It’s ♪ fine 😊

2
00:00:04.000 --> 00:00:05.000 line:0
<b>— Tempest Star Wolf —</b>`);
	});

	test("restores a misread file that also has correct punctuation", () => {
		expect(
			cleanWebVtt(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
Then we'll just beвЂ”

2
00:00:04.000 --> 00:00:05.000
Shizu, that one's still”`),
		).toBe(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
Then we'll just be—

2
00:00:04.000 --> 00:00:05.000
Shizu, that one's still”`);
	});

	test("restores a misread zero-width no-break space instead of dropping it", () => {
		expect(
			cleanWebVtt(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
Wait
п»їNoвЂ”`),
		).toBe(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
Wait
\uFEFFNo—`);
	});

	test("restores text garbled twice", () => {
		expect(
			cleanWebVtt(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
<i>Hands are so nice, letÃ¢â‚¬â„¢s hold each otherÃ¢â‚¬â„¢s</i>`),
		).toBe(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
<i>Hands are so nice, let’s hold each other’s</i>`);
	});

	test("restores a garbled file whose lines cut some characters off, leaving the cut ones", () => {
		expect(
			cleanWebVtt(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
Jeez, you know being stubborn won't help at allРІР

2
00:00:04.000 --> 00:00:05.000
So until then, I'llРІР‚вЂќ`),
		).toBe(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
Jeez, you know being stubborn won't help at allРІР

2
00:00:04.000 --> 00:00:05.000
So until then, I'll—`);
	});

	test("restores a misread file only once when its text looks misread again", () => {
		expect(
			cleanWebVtt(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
Р•С‘ Р·РґРµСЃСЊ РЅР°РІР°Р»РѕРј!

2
00:00:04.000 --> 00:00:05.000
Ã‡â€™aurait Ã©tÃ© sympa`),
		).toBe(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
Её здесь навалом!

2
00:00:04.000 --> 00:00:05.000
Ç’aurait été sympa`);
	});

	test("restores a file decoded as Windows-1252, letters included", () => {
		expect(
			cleanWebVtt(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
Waitâ€¦ â€œHereâ€\u009D Â© 2026

2
00:00:04.000 --> 00:00:05.000
PokÃ©mon cafÃ©`),
		).toBe(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
Wait… “Here” © 2026

2
00:00:04.000 --> 00:00:05.000
Pokémon café`);
	});

	test("leaves Russian text whose characters look like a misreading alone", () => {
		const text = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
Пусть «В» сейчас же

2
00:00:04.000 --> 00:00:05.000
О…

3
00:00:06.000 --> 00:00:07.000
Лёгкая, но прочная…

4
00:00:08.000 --> 00:00:09.000
Защищать учеников\u00A0— мой долг.`;

		expect(cleanWebVtt(text)).toBe(text);
	});

	test("leaves letters that only look misread alone", () => {
		const text = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
Привет, «друг» and PokÃ©mon`;

		expect(cleanWebVtt(text)).toBe(text);
	});

	test("leaves a letter followed by punctuation that reads like a misreading alone", () => {
		const text = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
Welcome to the

2
00:00:04.000 --> 00:00:05.000
<b>CAFÉ…</b>`;

		expect(cleanWebVtt(text)).toBe(text.replace("00:00:05.000\n<b>", "00:00:05.000 line:0\n<b>"));
	});

	test("drops cues left with no text", () => {
		expect(
			cleanWebVtt(`WEBVTT

1
00:00:01.000 --> 00:00:03.000
{\\p1}

2
00:00:04.000 --> 00:00:05.000
Kept`),
		).toBe(`WEBVTT

2
00:00:04.000 --> 00:00:05.000
Kept`);
	});
});

test("cleanWebVtt drops copies of a cue drawn as stacked ASS layers", () => {
	expect(
		cleanWebVtt(`WEBVTT

10:19.510 --> 10:25.270
<b>How I
\\h\\h\\h\\hImagine</b>

10:19.510 --> 10:25.270
<b>How I
\\h\\h\\h\\hImagine</b>

10:20.000 --> 10:25.270
<b>How I
\\h\\h\\h\\hImagine</b>`),
	).toBe(`WEBVTT

10:19.510 --> 10:25.270 line:0
<b>How I
Imagine</b>

10:20.000 --> 10:25.270 line:0
<b>How I
Imagine</b>`);
});

test("cleanWebVtt drops a sign that the dialogue shown with it says", () => {
	expect(
		cleanWebVtt(`WEBVTT

00:10:19.080 --> 00:10:20.590
<i>Hipokute herbs.</i>

00:10:19.340 --> 00:10:26.770
<b>Hipokute Herbs</b>

00:10:20.590 --> 00:10:24.320
<i>A valuable herb that only grows
in areas rich in magicules.</i>

00:10:20.760 --> 00:10:26.770
<b>A valuable herb that only grows
in areas rich in magicules,
used in healing potions.</b>

00:10:24.320 --> 00:10:26.770
<i>Used as an ingredient in
salves and healing potions.</i>`),
	).toBe(`WEBVTT

00:10:19.080 --> 00:10:20.590
<i>Hipokute herbs.</i>

00:10:20.590 --> 00:10:24.320
<i>A valuable herb that only grows
in areas rich in magicules.</i>

00:10:24.320 --> 00:10:26.770
<i>Used as an ingredient in
salves and healing potions.</i>`);
});

test("cleanWebVtt keeps a sign that says more than the dialogue shown with it, at the top", () => {
	expect(
		cleanWebVtt(`WEBVTT

00:03:26.960 --> 00:03:28.100
<i>Confirmed.</i>

00:03:28.310 --> 00:03:29.730
<b>Get Stabbed and Die</b>

00:03:28.320 --> 00:03:31.450
<i>Stab Resistance acquisition successful.</i>`),
	).toBe(`WEBVTT

00:03:26.960 --> 00:03:28.100
<i>Confirmed.</i>

00:03:28.310 --> 00:03:29.730 line:0
<b>Get Stabbed and Die</b>

00:03:28.320 --> 00:03:31.450
<i>Stab Resistance acquisition successful.</i>`);
});

test("cleanWebVtt keeps a sign that is said before or after it is shown, not during", () => {
	expect(
		cleanWebVtt(`WEBVTT

00:00:01.000 --> 00:00:02.000
No Entry, it says.

00:00:02.000 --> 00:00:04.000
<b>No Entry</b>`),
	).toBe(`WEBVTT

00:00:01.000 --> 00:00:02.000
No Entry, it says.

00:00:02.000 --> 00:00:04.000 line:0
<b>No Entry</b>`);
});

test("cleanWebVtt leaves a sign where its own position puts it", () => {
	const content = `WEBVTT

00:00:02.000 --> 00:00:04.000 line:85%
<b>No Entry</b>`;

	expect(cleanWebVtt(content)).toBe(content);
});

test("cleanWebVtt counts a sign whose bold is left unclosed or nested as a sign", () => {
	expect(
		cleanWebVtt(`WEBVTT

00:00:01.000 --> 00:00:02.000
<b>Consistency not found

00:00:03.000 --> 00:00:04.000
<b>The Secret World of <b>Cryptids</b></b>

00:00:05.000 --> 00:00:06.000
<b>Run</b>, he said.`),
	).toBe(`WEBVTT

00:00:01.000 --> 00:00:02.000 line:0
<b>Consistency not found

00:00:03.000 --> 00:00:04.000 line:0
<b>The Secret World of <b>Cryptids</b></b>

00:00:05.000 --> 00:00:06.000
<b>Run</b>, he said.`);
});

test("cleanWebVtt joins a cue shown again right as it ends into one", () => {
	expect(
		cleanWebVtt(`WEBVTT

00:04:32.080 --> 00:04:32.120
<b>Consistency not found among theoretical values.</b>

00:04:32.120 --> 00:04:32.160
<b>Consistency not found among theoretical values.

00:04:32.160 --> 00:04:32.450
<b>Consistency not found among theoretical values.

00:04:40.000 --> 00:04:41.000
<b>Consistency not found among theoretical values.</b>`),
	).toBe(`WEBVTT

00:04:32.080 --> 00:04:32.450 line:0
<b>Consistency not found among theoretical values.</b>

00:04:40.000 --> 00:04:41.000 line:0
<b>Consistency not found among theoretical values.</b>`);
});

describe("paceWebVtt", () => {
	test("holds a line too short to read into the pause after it", () => {
		expect(
			paceWebVtt(`WEBVTT

00:00:01.000 --> 00:00:01.500
Magicules?

00:00:05.000 --> 00:00:06.000
Explain it so I can understand!`),
		).toBe(`WEBVTT

00:00:01.000 --> 00:00:01.833
Magicules?

00:00:05.000 --> 00:00:06.824
Explain it so I can understand!`);
	});

	test("stops short of the next line", () => {
		expect(
			paceWebVtt(`WEBVTT

00:00:01.000 --> 00:00:02.000
A special energetic material found in all living things.

00:00:02.500 --> 00:00:04.000
Building blocks of life?`),
		).toBe(`WEBVTT

00:00:01.000 --> 00:00:02.417
A special energetic material found in all living things.

00:00:02.500 --> 00:00:04.000
Building blocks of life?`);
	});

	test("holds a line no more than a second and a half past its end", () => {
		expect(
			paceWebVtt(`WEBVTT

00:00:01.000 --> 00:00:01.500
A special energetic material found in all living things, and more.`),
		).toBe(`WEBVTT

00:00:01.000 --> 00:00:03.000
A special energetic material found in all living things, and more.`);
	});

	test("ends a line where the next starts once it has been up long enough to read", () => {
		expect(
			paceWebVtt(`WEBVTT

00:00:01.000 --> 00:00:04.000
Happy fifth birthday, Rudy!

00:00:03.500 --> 00:00:06.000
I wish you a very happy birthday.`),
		).toBe(`WEBVTT

00:00:01.000 --> 00:00:03.500
Happy fifth birthday, Rudy!

00:00:03.500 --> 00:00:06.000
I wish you a very happy birthday.`);
	});

	test("keeps lines spoken at once, or too close to read apart, overlapping", () => {
		const content = `WEBVTT

00:00:01.000 --> 00:00:04.000
Happy fifth birthday, Rudy!

00:00:01.000 --> 00:00:04.000
Happy birthday, Master Rudeus!

00:00:01.500 --> 00:00:04.000
Thank you!`;

		expect(paceWebVtt(content)).toBe(content);
	});

	test("leaves signs and lines long enough to read as they are", () => {
		const content = `WEBVTT

00:00:01.000 --> 00:00:01.200 line:0
<b>Analyze</b>

00:00:02.000 --> 00:00:04.000
Okay, then...`;

		expect(paceWebVtt(content)).toBe(content);
	});
});
