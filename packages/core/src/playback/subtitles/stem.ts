import { defined } from "@sora/shared";

/** A word reduced to its stem, such as `walk` for `walking`. */
export class Stem {
	readonly #text: string;

	constructor(word: string) {
		this.#text = word;

		if (word.length > 5 && word.endsWith("ing")) {
			this.#text = word.slice(0, -3);

			return;
		}

		if (word.length > 4 && word.endsWith("ed")) {
			this.#text = word.slice(0, -2);

			return;
		}

		const plural = word.length > 3 && word.endsWith("s") && !word.endsWith("ss");

		if (plural) {
			this.#text = word.slice(0, -1);
		}
	}

	/** Whether the two are one word, allowing for a mishearing in a long one. */
	same(other: Stem) {
		const left = this.#text;
		const right = other.#text;

		if (left === right) {
			return true;
		}

		/** How many letters of a word of the shorter one's length may be heard wrong. */
		const shortest = Math.min(left.length, right.length);
		let allowed = 0;

		if (shortest >= 5) {
			allowed = 1;
		}

		if (shortest >= 8) {
			allowed = 2;
		}

		return (
			allowed > 0 &&
			Math.abs(left.length - right.length) <= allowed &&
			this.#distance(other) <= allowed
		);
	}

	/** How many letters must be added, removed, or changed to turn one into the other. */
	#distance(other: Stem) {
		const left = this.#text;
		const right = other.#text;
		let row = Array.from({ length: right.length + 1 }, (_, index) => index);

		for (let i = 1; i <= left.length; i += 1) {
			const next = [i];

			for (let j = 1; j <= right.length; j += 1) {
				next[j] = Math.min(
					defined(row[j]) + 1,
					defined(next[j - 1]) + 1,
					defined(row[j - 1]) + Number(left[i - 1] !== right[j - 1]),
				);
			}

			row = next;
		}

		return defined(row[right.length]);
	}
}
