import { describe, expect, test } from "bun:test";

import { fingerprint, locateSong, sampleRate } from "./fingerprint";

/** A deterministic stand-in for music: a few tones that change every quarter second. */
const music = (seconds: number, seed: number) => {
	let state = seed;
	const random = () => {
		state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
		return state / 2_147_483_648;
	};
	const samples = new Int16Array(seconds * sampleRate);
	const noteSamples = sampleRate / 4;
	for (let note = 0; note * noteSamples < samples.length; note += 1) {
		const tones = Array.from(
			{
				length: 3,
			},
			() => ({
				amplitude: 2000 + random() * 6000,
				hz: 300 + random() * 2700,
			}),
		);
		for (
			let index = 0;
			index < noteSamples && note * noteSamples + index < samples.length;
			index += 1
		) {
			const time = (note * noteSamples + index) / sampleRate;
			samples[note * noteSamples + index] = tones.reduce(
				(sum, tone) => sum + tone.amplitude * Math.sin(2 * Math.PI * tone.hz * time),
				0,
			);
		}
	}
	return samples;
};

/** `song` played into `episode` from `at` seconds, a little quieter and with the episode's sound under it. */
const playInto = (episode: Int16Array, song: Int16Array, at: number) => {
	const mixed = Int16Array.from(episode);
	for (let index = 0; index < song.length; index += 1) {
		const target = at * sampleRate + index;
		mixed[target] = Math.round(0.8 * (song[index] ?? 0) + 0.1 * (episode[target] ?? 0));
	}
	return mixed;
};

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
