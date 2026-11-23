import type { TmdbImage } from "./resources";

/** How good a TMDB still is, before votes; see `rankStills`. */
export class StillRank {
	static readonly #widescreen = 16 / 9;

	/** How far from 16:9 a still's aspect ratio may be and count as widescreen. */
	static readonly #widescreenTolerance = 0.1;

	/** Stills narrower than this are the last to be picked. */
	static readonly #smallestWidth = 1000;

	readonly #still: TmdbImage;

	constructor(still: TmdbImage) {
		this.#still = still;
	}

	/** Its faults in order of weight, each 1 when it has it: a language, not widescreen, too narrow. */
	get tier(): number[] {
		const still = this.#still;
		const ratio = still.width / still.height;

		return [
			Number(still.iso_639_1 !== null),
			Number(Math.abs(ratio - StillRank.#widescreen) > StillRank.#widescreenTolerance),
			Number(still.width < StillRank.#smallestWidth),
		];
	}
}
