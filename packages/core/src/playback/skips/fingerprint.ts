/**
 * Audio fingerprints, for finding where a theme song plays in an episode.
 *
 * Each 50 ms frame of mono 8 kHz audio gets a 16-bit code from how the
 * energy of 17 bands between 300 and 3000 Hz changes from the frame before
 * (Haitsma and Kalker's sub-fingerprints). The same recording keeps most bits
 * through re-encoding and mixing; unrelated audio flips about half.
 */

/** Samples per second the audio is read at. */
export const sampleRate = 8000;

/** Seconds between frames. */
export const frameSeconds = 0.05;

const hop = sampleRate * frameSeconds;
const windowSize = 2048;
const bandCount = 17;
const lowestHz = 300;
const highestHz = 3000;

/** A recording's fingerprint, one entry per frame. */
export interface Fingerprint {
	codes: Uint16Array;
	/** 1 where the frame is loud enough to carry a code; silence matches anything. */
	loud: Uint8Array;
}

const window = Float64Array.from(
	{
		length: windowSize,
	},
	(_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (windowSize - 1)),
);

/** Which band each spectrum bin adds to, or -1 for bins outside every band. */
const bandOfBin = (() => {
	const edges = Array.from(
		{
			length: bandCount + 1,
		},
		(_, index) => lowestHz * (highestHz / lowestHz) ** (index / bandCount),
	);
	return Int8Array.from(
		{
			length: windowSize / 2 + 1,
		},
		(_, bin) => {
			const hz = (bin * sampleRate) / windowSize;
			const band = edges.findIndex((edge, index) => hz >= edge && hz < (edges[index + 1] ?? 0));
			return band;
		},
	);
})();

const bitReversed = (() => {
	const bits = Math.log2(windowSize);
	return Uint16Array.from(
		{
			length: windowSize,
		},
		(_, index) => {
			let reversed = 0;
			for (let bit = 0; bit < bits; bit += 1) {
				reversed = (reversed << 1) | ((index >> bit) & 1);
			}
			return reversed;
		},
	);
})();

const cosines = Float64Array.from(
	{
		length: windowSize / 2,
	},
	(_, index) => Math.cos((-2 * Math.PI * index) / windowSize),
);
const sines = Float64Array.from(
	{
		length: windowSize / 2,
	},
	(_, index) => Math.sin((-2 * Math.PI * index) / windowSize),
);

/** In-place radix-2 FFT of `real` + i·`imaginary`, both {@link windowSize} long. */
const fft = (real: Float64Array, imaginary: Float64Array) => {
	for (let index = 0; index < windowSize; index += 1) {
		const other = bitReversed[index] ?? 0;
		if (other > index) {
			const re = real[index] ?? 0;
			real[index] = real[other] ?? 0;
			real[other] = re;
			const im = imaginary[index] ?? 0;
			imaginary[index] = imaginary[other] ?? 0;
			imaginary[other] = im;
		}
	}
	for (let size = 2; size <= windowSize; size *= 2) {
		const half = size / 2;
		const step = windowSize / size;
		for (let start = 0; start < windowSize; start += size) {
			for (let offset = 0; offset < half; offset += 1) {
				const cos = cosines[offset * step] ?? 0;
				const sin = sines[offset * step] ?? 0;
				const even = start + offset;
				const odd = even + half;
				const oddRe = real[odd] ?? 0;
				const oddIm = imaginary[odd] ?? 0;
				const re = oddRe * cos - oddIm * sin;
				const im = oddRe * sin + oddIm * cos;
				real[odd] = (real[even] ?? 0) - re;
				imaginary[odd] = (imaginary[even] ?? 0) - im;
				real[even] = (real[even] ?? 0) + re;
				imaginary[even] = (imaginary[even] ?? 0) + im;
			}
		}
	}
};

/**
 * Fills `bands` with the log energy of each band in the frame at `offset`,
 * and returns the log energy of the whole frame.
 */
const frameEnergy = (
	samples: Int16Array,
	offset: number,
	bands: Float64Array,
	real: Float64Array,
	imaginary: Float64Array,
) => {
	for (let index = 0; index < windowSize; index += 1) {
		real[index] = ((samples[offset + index] ?? 0) / 32_768) * (window[index] ?? 0);
		imaginary[index] = 0;
	}
	fft(real, imaginary);

	bands.fill(0);
	let total = 0;
	for (let bin = 0; bin <= windowSize / 2; bin += 1) {
		const power = (real[bin] ?? 0) ** 2 + (imaginary[bin] ?? 0) ** 2;
		total += power;
		const band = bandOfBin[bin] ?? -1;
		if (band >= 0) {
			bands[band] = (bands[band] ?? 0) + power;
		}
	}
	for (let band = 0; band < bandCount; band += 1) {
		bands[band] = Math.log((bands[band] ?? 0) + 1e-10);
	}
	return Math.log(total + 1e-10);
};

/** A frame's code: for each pair of neighbouring bands, whether their difference grew since the frame before. */
const codeOf = (current: Float64Array, previous: Float64Array) => {
	let code = 0;
	for (let bit = 0; bit < bandCount - 1; bit += 1) {
		const now = (current[bit] ?? 0) - (current[bit + 1] ?? 0);
		const before = (previous[bit] ?? 0) - (previous[bit + 1] ?? 0);
		if (now - before > 0) {
			code |= 1 << bit;
		}
	}
	return code;
};

/** The fingerprint of mono 16-bit audio at {@link sampleRate}. */
export const fingerprint = (samples: Int16Array): Fingerprint => {
	const frames =
		samples.length < windowSize ? 0 : 1 + Math.floor((samples.length - windowSize) / hop);
	const codes = new Uint16Array(frames);
	const loudness = new Float64Array(frames);
	const real = new Float64Array(windowSize);
	const imaginary = new Float64Array(windowSize);
	let previous = new Float64Array(bandCount);
	let current = new Float64Array(bandCount);

	for (let frame = 0; frame < frames; frame += 1) {
		loudness[frame] = frameEnergy(samples, frame * hop, current, real, imaginary);
		codes[frame] = frame > 0 ? codeOf(current, previous) : 0;
		[previous, current] = [current, previous];
	}

	const sorted = loudness.toSorted();
	const median = sorted.length > 0 ? (sorted[Math.floor((sorted.length - 1) / 2)] ?? 0) : 0;
	const loud = Uint8Array.from(loudness, (value) => (value > median - 6 ? 1 : 0));
	return {
		codes,
		loud,
	};
};

const bitCounts = Uint8Array.from(
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

/** A stretch two recordings share, in frames, with its mean bit error rate. */
interface SharedRun {
	aStart: number;
	aEnd: number;
	bStart: number;
	bEnd: number;
	errorRate: number;
}

/** Codes this common in `a` are skipped, since they vote for every offset. */
const commonCode = 40;
/** Offsets tried per pair, most voted first. */
const offsetsTried = 24;
const fewestVotes = 12;
/** Mean share of differing bits below which two stretches are the same audio. */
const sameAudio = 0.32;
const smoothingFrames = Math.round(2 / frameSeconds);
/** Gaps shorter than this, such as a line of dialogue over the song, do not break a run. */
const bridgedFrames = Math.round(3 / frameSeconds);

/**
 * Where each loud frame of `a` sits, by its code: `positions` from
 * `firsts[code]` up to `firsts[code + 1]`.
 */
const indexCodes = (a: Fingerprint) => {
	const counts = new Uint32Array(1 << 16);
	for (let index = 0; index < a.codes.length; index += 1) {
		if (a.loud[index]) {
			counts[a.codes[index] ?? 0] = (counts[a.codes[index] ?? 0] ?? 0) + 1;
		}
	}
	const firsts = new Uint32Array((1 << 16) + 1);
	for (let code = 0; code < 1 << 16; code += 1) {
		firsts[code + 1] = (firsts[code] ?? 0) + (counts[code] ?? 0);
	}
	const positions = new Uint32Array(firsts[1 << 16] ?? 0);
	const filled = firsts.slice(0, 1 << 16);
	for (let index = 0; index < a.codes.length; index += 1) {
		if (a.loud[index]) {
			const code = a.codes[index] ?? 0;
			positions[filled[code] ?? 0] = index;
			filled[code] = (filled[code] ?? 0) + 1;
		}
	}
	return {
		counts,
		firsts,
		positions,
	};
};

/** How many equal codes put `b` at each offset from `a`, smoothed over neighbouring offsets. */
const offsetVotes = (a: Fingerprint, b: Fingerprint) => {
	const { counts, firsts, positions } = indexCodes(a);
	const shift = a.codes.length;
	const votes = new Float64Array(a.codes.length + b.codes.length + 1);
	for (let index = 0; index < b.codes.length; index += 1) {
		if (!b.loud[index]) {
			continue;
		}
		const code = b.codes[index] ?? 0;
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
};

/** The stretches of at least `shortestFrames` where `b`, `offset` frames after `a`, plays the same audio. */
const runsAt = (a: Fingerprint, b: Fingerprint, offset: number, shortestFrames: number) => {
	const first = Math.max(0, -offset);
	const last = Math.min(a.codes.length, b.codes.length - offset);
	if (last - first < smoothingFrames) {
		return [];
	}

	// Encodes can drift by a frame, so each frame takes the best of three offsets.
	const errors = new Float64Array(last - first);
	for (let index = first; index < last; index += 1) {
		let best = 16;
		for (let drift = -1; drift <= 1; drift += 1) {
			const other = Math.min(b.codes.length - 1, Math.max(0, index + offset + drift));
			best = Math.min(best, bitCounts[(a.codes[index] ?? 0) ^ (b.codes[other] ?? 0)] ?? 16);
		}
		errors[index - first] = best / 16;
	}

	const sums = new Float64Array(errors.length + 1);
	for (let index = 0; index < errors.length; index += 1) {
		sums[index + 1] = (sums[index] ?? 0) + (errors[index] ?? 0);
	}
	const smoothed = Float64Array.from(errors, (_, index) => {
		const from = Math.max(0, index - smoothingFrames / 2);
		const to = Math.min(errors.length, index + smoothingFrames / 2);
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
			if (previous && start - previous[1] < bridgedFrames) {
				previous[1] = index;
			} else {
				stretches.push([start, index]);
			}
			start = -1;
		}
	}

	return stretches
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
		});
};

/** Every stretch of at least `shortestSeconds` that `a` and `b` share. */
export const sharedRuns = (a: Fingerprint, b: Fingerprint, shortestSeconds: number) => {
	const { shift, votes } = offsetVotes(a, b);
	const order = [...votes.keys()].toSorted(
		(left, right) => (votes[right] ?? 0) - (votes[left] ?? 0),
	);
	const tried = new Set<number>();
	const found: SharedRun[] = [];
	const shortestFrames = Math.round(shortestSeconds / frameSeconds);

	for (const slot of order) {
		if ((votes[slot] ?? 0) < fewestVotes || tried.size >= offsetsTried) {
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

		for (const run of runsAt(a, b, slot - shift, shortestFrames)) {
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
};

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
