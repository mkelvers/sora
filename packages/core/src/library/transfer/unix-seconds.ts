/** A moment AniList stores as Unix seconds; `0` is how it says it has none. */
export class UnixSeconds {
	readonly #seconds: number | null | undefined;

	constructor(seconds: number | null | undefined) {
		this.#seconds = seconds;
	}

	get date(): Date | null {
		if (this.#seconds) {
			return new Date(this.#seconds * 1000);
		}

		return null;
	}
}
