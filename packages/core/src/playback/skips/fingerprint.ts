/**
 * Audio fingerprints, for finding where a theme song plays in an episode.
 *
 * Each 50 ms frame of mono 8 kHz audio gets a 16-bit code from how the
 * energy of 17 bands between 300 and 3000 Hz changes from the frame before
 * (Haitsma and Kalker's sub-fingerprints). The same recording keeps most bits
 * through re-encoding and mixing; unrelated audio flips about half.
 */

import { sampleRate, Spectrum } from "./spectrum";

/** Seconds between frames. */
export const frameSeconds = 0.05;

const hop = sampleRate * frameSeconds;

/** A recording's fingerprint, one entry per frame. */
export interface Fingerprint {
	codes: Uint16Array;
	/** 1 where the frame is loud enough to carry a code; silence matches anything. */
	loud: Uint8Array;
}

/** The fingerprint of mono 16-bit audio at {@link sampleRate}. */
export const fingerprint = (samples: Int16Array): Fingerprint => {
	let frames = 0;

	if (samples.length >= Spectrum.size) {
		frames = 1 + Math.floor((samples.length - Spectrum.size) / hop);
	}

	const codes = new Uint16Array(frames);
	const loudness = new Float64Array(frames);
	const spectrum = new Spectrum();
	let previous = new Float64Array(Spectrum.bands);
	let current = new Float64Array(Spectrum.bands);

	for (let frame = 0; frame < frames; frame += 1) {
		loudness[frame] = spectrum.energy(samples, frame * hop, current);

		// A frame's code: for each pair of neighbouring bands, whether their
		// difference grew since the frame before.
		let code = 0;

		if (frame > 0) {
			for (let bit = 0; bit < Spectrum.bands - 1; bit += 1) {
				const now = (current[bit] ?? 0) - (current[bit + 1] ?? 0);
				const before = (previous[bit] ?? 0) - (previous[bit + 1] ?? 0);

				if (now - before > 0) {
					code |= 1 << bit;
				}
			}
		}

		codes[frame] = code;
		[previous, current] = [current, previous];
	}

	const sorted = loudness.toSorted();
	let median = 0;

	if (sorted.length > 0) {
		median = sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
	}

	const loud = Uint8Array.from(loudness, (value) => Number(value > median - 6));

	return {
		codes,
		loud,
	};
};

/** A stretch two recordings share, in frames, with its mean bit error rate. */
interface SharedRun {
	aStart: number;
	aEnd: number;
	bStart: number;
	bEnd: number;
	errorRate: number;
}

/** Two recordings' fingerprints, compared for the audio they share. */
class Pair {
	static readonly #bitCounts = Uint8Array.from(
		{
			length: 1 << 16,
		},
		(_, value) => {
			let count = 0;

			for (let rest = value; rest; rest &= rest - 1) {
				count += 1;
			}

			return count;
		},
	);

	/** Offsets tried per pair, most voted first. */
	static readonly #offsetsTried = 24;

	static readonly #smoothingFrames = Math.round(2 / frameSeconds);

	/** Gaps shorter than this, such as a line of dialogue over the song, do not break a run. */
	static readonly #bridgedFrames = Math.round(3 / frameSeconds);

	readonly #a: Fingerprint;
	readonly #b: Fingerprint;

	constructor(a: Fingerprint, b: Fingerprint) {
		this.#a = a;
		this.#b = b;
	}

	/** Every stretch of at least `shortestSeconds` that the two share. */
	runs(shortestSeconds: number) {
		const fewestVotes = 12;

		const { shift, votes } = this.#votes();

		const order = [...votes.keys()].toSorted(
			(left, right) => (votes[right] ?? 0) - (votes[left] ?? 0),
		);

		const tried = new Set<number>();
		const found: SharedRun[] = [];
		const shortestFrames = Math.round(shortestSeconds / frameSeconds);

		for (const slot of order) {
			if ((votes[slot] ?? 0) < fewestVotes || tried.size >= Pair.#offsetsTried) {
				break;
			}

			let near = false;

			for (let other = slot - 3; other <= slot + 3; other += 1) {
				near ||= tried.has(other);
			}

			if (near) {
				continue;
			}

			tried.add(slot);

			for (const run of this.#runsAt(slot - shift, shortestFrames)) {
				const overlaps = found.some(
					(other) =>
						run.aStart < other.aEnd &&
						other.aStart < run.aEnd &&
						run.bStart < other.bEnd &&
						other.bStart < run.bEnd,
				);

				if (!overlaps) {
					found.push(run);
				}
			}
		}

		return found.toSorted((left, right) => left.aStart - right.aStart);
	}

	/**
	 * Where each loud frame of `a` sits, by its code: `positions` from
	 * `firsts[code]` up to `firsts[code + 1]`.
	 */
	#index() {
		const counts = new Uint32Array(1 << 16);

		for (let index = 0; index < this.#a.codes.length; index += 1) {
			if (this.#a.loud[index]) {
				counts[this.#a.codes[index] ?? 0] = (counts[this.#a.codes[index] ?? 0] ?? 0) + 1;
			}
		}

		const firsts = new Uint32Array((1 << 16) + 1);

		for (let code = 0; code < 1 << 16; code += 1) {
			firsts[code + 1] = (firsts[code] ?? 0) + (counts[code] ?? 0);
		}

		const positions = new Uint32Array(firsts[1 << 16] ?? 0);
		const filled = firsts.slice(0, 1 << 16);

		for (let index = 0; index < this.#a.codes.length; index += 1) {
			if (this.#a.loud[index]) {
				const code = this.#a.codes[index] ?? 0;
				positions[filled[code] ?? 0] = index;
				filled[code] = (filled[code] ?? 0) + 1;
			}
		}

		return {
			counts,
			firsts,
			positions,
		};
	}

	/** How many equal codes put `b` at each offset from `a`, smoothed over neighbouring offsets. */
	#votes() {
		/** Codes this common in `a` are skipped, since they vote for every offset. */
		const commonCode = 40;

		const { counts, firsts, positions } = this.#index();
		const shift = this.#a.codes.length;
		const votes = new Float64Array(this.#a.codes.length + this.#b.codes.length + 1);

		for (let index = 0; index < this.#b.codes.length; index += 1) {
			if (!this.#b.loud[index]) {
				continue;
			}

			const code = this.#b.codes[index] ?? 0;
			const count = counts[code] ?? 0;

			if (count === 0 || count > commonCode) {
				continue;
			}

			for (let at = firsts[code] ?? 0; at < (firsts[code + 1] ?? 0); at += 1) {
				const slot = index - (positions[at] ?? 0) + shift;
				votes[slot] = (votes[slot] ?? 0) + 1;
			}
		}

		const smoothed = Float64Array.from(
			votes,
			(value, index) => value + (votes[index - 1] ?? 0) + (votes[index + 1] ?? 0),
		);

		return {
			shift,
			votes: smoothed,
		};
	}

	/** The stretches of at least `shortestFrames` where `b`, `offset` frames after `a`, plays the same audio. */
	#runsAt(offset: number, shortestFrames: number) {
		/** Mean share of differing bits below which two stretches are the same audio. */
		const sameAudio = 0.32;

		const first = Math.max(0, -offset);
		const last = Math.min(this.#a.codes.length, this.#b.codes.length - offset);

		if (last - first < Pair.#smoothingFrames) {
			return [];
		}

		// Encodes can drift by a frame, so each frame takes the best of three offsets.
		const errors = new Float64Array(last - first);

		for (let index = first; index < last; index += 1) {
			let best = 16;

			for (let drift = -1; drift <= 1; drift += 1) {
				const other = Math.min(this.#b.codes.length - 1, Math.max(0, index + offset + drift));
				best = Math.min(
					best,
					Pair.#bitCounts[(this.#a.codes[index] ?? 0) ^ (this.#b.codes[other] ?? 0)] ?? 16,
				);
			}

			errors[index - first] = best / 16;
		}

		const sums = new Float64Array(errors.length + 1);

		for (let index = 0; index < errors.length; index += 1) {
			sums[index + 1] = (sums[index] ?? 0) + (errors[index] ?? 0);
		}

		const smoothed = Float64Array.from(errors, (_, index) => {
			const from = Math.max(0, index - Pair.#smoothingFrames / 2);
			const to = Math.min(errors.length, index + Pair.#smoothingFrames / 2);

			return ((sums[to] ?? 0) - (sums[from] ?? 0)) / (to - from);
		});

		const stretches: [number, number][] = [];
		let start = -1;

		for (let index = 0; index <= smoothed.length; index += 1) {
			const same = index < smoothed.length && (smoothed[index] ?? 1) < sameAudio;

			if (same && start < 0) {
				start = index;
			}

			if (!same && start >= 0) {
				const previous = stretches.at(-1);

				if (previous && start - previous[1] < Pair.#bridgedFrames) {
					previous[1] = index;
				} else {
					stretches.push([start, index]);
				}

				start = -1;
			}
		}

		return stretches
			.values()
			.filter(([from, to]) => to - from >= shortestFrames)
			.map(([from, to]): SharedRun => {
				let total = 0;

				for (let index = from; index < to; index += 1) {
					total += smoothed[index] ?? 0;
				}

				return {
					aEnd: first + to,
					aStart: first + from,
					bEnd: first + to + offset,
					bStart: first + from + offset,
					errorRate: total / (to - from),
				};
			})
			.toArray();
	}
}

/** Every stretch of at least `shortestSeconds` that `a` and `b` share. */
export const sharedRuns = (a: Fingerprint, b: Fingerprint, shortestSeconds: number) =>
	new Pair(a, b).runs(shortestSeconds);

/** Where a song plays in a recording, in seconds of the recording. */
export interface SongMatch {
	start: number;
	end: number;
	/** The share of the song that plays there, 0–1. */
	coverage: number;
}

/**
 * Where `song` plays in `recording`: the stretches it shares at one offset,
 * so a line of dialogue or a sound effect over the song does not split it.
 * `null` when no stretch of 10 seconds matches.
 */
export const locateSong = (song: Fingerprint, recording: Fingerprint): SongMatch | null => {
	const runs = sharedRuns(song, recording, 10);
	const tolerance = Math.round(1 / frameSeconds);
	const groups: SharedRun[][] = [];

	for (const run of runs) {
		const offset = run.bStart - run.aStart;

		const group = groups.find(
			(candidate) =>
				Math.abs((candidate[0]?.bStart ?? 0) - (candidate[0]?.aStart ?? 0) - offset) <= tolerance,
		);

		if (group) {
			group.push(run);
		} else {
			groups.push([run]);
		}
	}

	const length = (group: SharedRun[]) =>
		group.reduce((total, run) => total + run.aEnd - run.aStart, 0);

	const [best] = groups.toSorted((left, right) => length(right) - length(left));

	if (!best) {
		return null;
	}

	return {
		coverage: Math.min(1, length(best) / Math.max(1, song.codes.length)),
		end: Math.max(...best.map((run) => run.bEnd)) * frameSeconds,
		start: Math.min(...best.map((run) => run.bStart)) * frameSeconds,
	};
};
