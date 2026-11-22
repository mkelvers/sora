import { defined } from "@sora/shared";

import type { CueAnchor } from "../subtitles/refine";

/** Anchors of a subtitle's cues, in ascending order of their start. */
export class Anchors {
	readonly #anchors: CueAnchor[];

	constructor(anchors: CueAnchor[]) {
		this.#anchors = anchors;
	}

	/** The anchor whose cue is the one from `start` to `end`, if any. */
	match(start: number, end: number) {
		/** How much of a cue an anchor's cue must overlap for them to be the same line. */
		const sameCueOverlap = 0.6;

		let low = 0;
		let high = this.#anchors.length;

		while (low < high) {
			const middle = Math.floor((low + high) / 2);

			if (defined(this.#anchors[middle]).start < start) {
				low = middle + 1;
			} else {
				high = middle;
			}
		}

		let best: CueAnchor | null = null;
		let bestOverlap = sameCueOverlap;

		for (const anchor of this.#anchors.slice(Math.max(0, low - 2), low + 3)) {
			const overlap =
				Math.max(0, Math.min(end, anchor.end) - Math.max(start, anchor.start)) /
				Math.max(end - start, anchor.end - anchor.start, 0.001);

			if (overlap >= bestOverlap) {
				best = anchor;
				bestOverlap = overlap;
			}
		}

		return best;
	}
}
