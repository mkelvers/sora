import { describe, expect, test } from "bun:test";

import { fingerprint, locateSong } from "./fingerprint";
import { music, playInto } from "./fingerprint.fixture";
import { sampleRate } from "./spectrum";

describe("locateSong", () => {
	const song = music(90, 1);
	const episode = music(400, 2);

	test("finds where a song plays in a recording", () => {
		const match = locateSong(fingerprint(song), fingerprint(playInto(episode, song, 123)));

		expect(match?.start).toBeCloseTo(123, 0);
		expect(match?.end).toBeCloseTo(213, 0);
		expect(match?.coverage).toBeGreaterThan(0.95);
	});

	test("finds no song in a recording that does not play it", () => {
		const match = locateSong(fingerprint(song), fingerprint(episode));

		expect(match === null || match.coverage < 0.2).toBe(true);
	});

	test("reports how much of a song plays when only part of it does", () => {
		const half = song.subarray(0, 45 * sampleRate);
		const match = locateSong(fingerprint(song), fingerprint(playInto(episode, half, 200)));

		expect(match?.start).toBeCloseTo(200, 0);
		expect(match?.coverage).toBeGreaterThan(0.4);
		expect(match?.coverage).toBeLessThan(0.6);
	});
});
