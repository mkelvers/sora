/** Samples per second the audio is read at. */
export const sampleRate = 8000;

/**
 * The band energies of 2048-sample frames of mono 16-bit audio at
 * {@link sampleRate}, from 17 bands between 300 and 3000 Hz.
 */
export class Spectrum {
	/** Samples per frame. */
	static readonly size = 2048;

	/** Bands per frame. */
	static readonly bands = 17;

	static readonly #window = Float64Array.from(
		{
			length: Spectrum.size,
		},
		(_, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (Spectrum.size - 1)),
	);

	/** Which band each spectrum bin adds to, or -1 for bins outside every band. */
	static readonly #bandOfBin = (() => {
		const lowestHz = 300;
		const highestHz = 3000;

		const edges = Array.from(
			{
				length: Spectrum.bands + 1,
			},
			(_, index) => lowestHz * (highestHz / lowestHz) ** (index / Spectrum.bands),
		);

		return Int8Array.from(
			{
				length: Spectrum.size / 2 + 1,
			},
			(_, bin) => {
				const hz = (bin * sampleRate) / Spectrum.size;
				const band = edges.findIndex((edge, index) => hz >= edge && hz < (edges[index + 1] ?? 0));

				return band;
			},
		);
	})();

	static readonly #bitReversed = (() => {
		const bits = Math.log2(Spectrum.size);

		return Uint16Array.from(
			{
				length: Spectrum.size,
			},
			(_, index) => {
				let reversed = 0;

				for (let bit = 0; bit < bits; bit += 1) {
					reversed = reversed * 2 + (Math.floor(index / 2 ** bit) % 2);
				}

				return reversed;
			},
		);
	})();

	static readonly #cosines = Float64Array.from(
		{
			length: Spectrum.size / 2,
		},
		(_, index) => Math.cos((-2 * Math.PI * index) / Spectrum.size),
	);

	static readonly #sines = Float64Array.from(
		{
			length: Spectrum.size / 2,
		},
		(_, index) => Math.sin((-2 * Math.PI * index) / Spectrum.size),
	);

	readonly #real = new Float64Array(Spectrum.size);
	readonly #imaginary = new Float64Array(Spectrum.size);

	/**
	 * Fills `bands` with the log energy of each band in the frame at `offset`,
	 * and returns the log energy of the whole frame.
	 */
	energy(samples: Int16Array, offset: number, bands: Float64Array) {
		const real = this.#real;
		const imaginary = this.#imaginary;

		for (let index = 0; index < Spectrum.size; index += 1) {
			real[index] = ((samples[offset + index] ?? 0) / 32_768) * (Spectrum.#window[index] ?? 0);
			imaginary[index] = 0;
		}

		this.#fft();

		bands.fill(0);
		let total = 0;

		for (let bin = 0; bin <= Spectrum.size / 2; bin += 1) {
			const power = (real[bin] ?? 0) ** 2 + (imaginary[bin] ?? 0) ** 2;
			total += power;
			const band = Spectrum.#bandOfBin[bin] ?? -1;

			if (band >= 0) {
				bands[band] = (bands[band] ?? 0) + power;
			}
		}

		for (let band = 0; band < Spectrum.bands; band += 1) {
			bands[band] = Math.log((bands[band] ?? 0) + 1e-10);
		}

		return Math.log(total + 1e-10);
	}

	/** In-place radix-2 FFT of the frame's real and imaginary parts. */
	#fft() {
		const real = this.#real;
		const imaginary = this.#imaginary;
		const { size } = Spectrum;

		for (let index = 0; index < size; index += 1) {
			const other = Spectrum.#bitReversed[index] ?? 0;

			if (other > index) {
				const re = real[index] ?? 0;
				real[index] = real[other] ?? 0;
				real[other] = re;
				const im = imaginary[index] ?? 0;
				imaginary[index] = imaginary[other] ?? 0;
				imaginary[other] = im;
			}
		}

		for (let span = 2; span <= size; span *= 2) {
			const half = span / 2;
			const step = size / span;

			for (let start = 0; start < size; start += span) {
				for (let offset = 0; offset < half; offset += 1) {
					const cos = Spectrum.#cosines[offset * step] ?? 0;
					const sin = Spectrum.#sines[offset * step] ?? 0;
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
	}
}
