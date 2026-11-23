/** An episode or film length in minutes, or unknown. */
export class Runtime {
	readonly #minutes: number | null;

	constructor(minutes: number | null) {
		this.#minutes = minutes;
	}

	/**
	 * Whether this and `other` describe the same kind of content: the longer is
	 * at most `tolerance` times the shorter. Unknown lengths agree with anything.
	 */
	agrees(other: number | null, tolerance: number): boolean {
		const minutes = this.#minutes;

		if (!minutes || !other) {
			return true;
		}

		return Math.max(minutes, other) / Math.min(minutes, other) <= tolerance;
	}
}
