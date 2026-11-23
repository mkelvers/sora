/** How long something TMDB is asked about has been missing; `null` when not known. */
export class Absence {
	readonly #forMs: number | null;

	constructor(forMs: number | null) {
		this.#forMs = forMs;
	}

	/**
	 * How long to wait before asking TMDB again: a tenth of how long it has
	 * been missing, within `bounds`. What is written soon after an episode
	 * airs is asked about often, and what has been missing for days or years,
	 * and so is unlikely to come today, rarely.
	 */
	recheckAfter(bounds: { min: number; max: number }): number {
		return Math.min(bounds.max, Math.max(bounds.min, (this.#forMs ?? Infinity) / 10));
	}
}
