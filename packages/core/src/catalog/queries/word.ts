import { defined } from "@sora/shared";

/** A word of a query, compared with the words of a title. */
export class Word {
	readonly #text: string;

	constructor(text: string) {
		this.#text = text;
	}

	/**
	 * How many of its letters may be wrong: none in a short word, where one
	 * letter makes another word, one in a word of five letters or more, and
	 * two in one of nine or more.
	 */
	get tolerance() {
		if (this.#text.length >= 9) {
			return 2;
		}

		if (this.#text.length >= 5) {
			return 1;
		}

		return 0;
	}

	/**
	 * The fewest letters inserted, removed, replaced, or swapped with their
	 * neighbour that turn this word into `other`.
	 */
	distance(other: string) {
		const a = [...this.#text];
		const b = [...other];

		const rows = Array.from(
			{
				length: a.length + 1,
			},
			(_, i) =>
				Array.from(
					{
						length: b.length + 1,
					},
					(_cell, j) => {
						if (i === 0 || j === 0) {
							return Math.max(i, j);
						}

						return 0;
					},
				),
		);

		for (let i = 1; i <= a.length; i += 1) {
			for (let j = 1; j <= b.length; j += 1) {
				let cost = 1;

				if (a[i - 1] === b[j - 1]) {
					cost = 0;
				}

				let best = Math.min(
					defined(defined(rows[i - 1])[j]) + 1,
					defined(defined(rows[i])[j - 1]) + 1,
					defined(defined(rows[i - 1])[j - 1]) + cost,
				);

				const transposed = i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1];

				if (transposed) {
					best = Math.min(best, defined(defined(rows[i - 2])[j - 2]) + 1);
				}

				defined(rows[i])[j] = best;
			}
		}

		return defined(defined(rows[a.length])[b.length]);
	}
}
