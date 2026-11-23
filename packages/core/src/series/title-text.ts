/** A title as matching compares it. */
export class TitleText {
	/** Numbers titles write as words, so "Season Two" and "Second Season" both count as 2. */
	static readonly #numberWords = new Map<string, number>(
		(
			[
				[1, "one", "first"],
				[2, "two", "second"],
				[3, "three", "third"],
				[4, "four", "fourth"],
				[5, "five", "fifth"],
				[6, "six", "sixth"],
				[7, "seven", "seventh"],
				[8, "eight", "eighth"],
				[9, "nine", "ninth"],
				[10, "ten", "tenth"],
				[11, "eleven"],
				[12, "twelve"],
				[13, "thirteen"],
				[14, "fourteen"],
				[15, "fifteen"],
				[16, "sixteen"],
				[17, "seventeen"],
				[18, "eighteen"],
				[19, "nineteen"],
				[20, "twenty"],
			] as const
		).flatMap(([number, ...words]) => words.map((word) => [word, number] as const)),
	);

	static readonly #romanValues = new Map<string, number>(
		Object.entries({
			c: 100,
			i: 1,
			l: 50,
			v: 5,
			x: 10,
		}),
	);

	readonly #title: string;

	constructor(title: string) {
		this.#title = title;
	}

	/**
	 * Lowercased, with full-width characters folded and punctuation reduced to
	 * single spaces, so "Re:ZERO -Starting Life-" and "Re: Zero Starting Life" compare equal.
	 */
	get normalized(): string {
		const folded = this.#title.normalize("NFKC");

		return folded
			.toLowerCase()
			.replaceAll("&", " and ")
			.replaceAll(/[\p{P}\p{S}]+/gu, " ")
			.replaceAll(/\s+/gu, " ")
			.trim();
	}

	/** The title's numbers in order, such as `"2"` for "Infinity Castle Part 2". */
	get numbers(): string {
		return this.normalized
			.split(" ")
			.flatMap((word) => {
				const written = TitleText.#numberWords.get(word) ?? TitleText.#romanValue(word);

				if (written === null) {
					return (word.match(/\d+/gu) ?? []).map(Number);
				}

				return [written];
			})
			.join(" ");
	}

	/** How often each pair of adjacent characters occurs in the normalised title. */
	get bigrams(): Map<string, number> {
		const value = this.normalized;
		const grams = new Map<string, number>();

		for (let index = 0; index < value.length - 1; index += 1) {
			const gram = value.slice(index, index + 2);
			grams.set(gram, (grams.get(gram) ?? 0) + 1);
		}

		return grams;
	}

	/**
	 * The value of a roman numeral from 2 to 399, or `null`. A lone "I", "V",
	 * "X", "L" or "C" is left out: it is as often a letter ("Gundam X", "I'm")
	 * as a numeral. "D" and "M" are not read, so "mix" and "mild" stay words.
	 */
	static #romanValue(word: string): number | null {
		/** Canonical numerals only, so "iiii" and "vx" stay words. */
		const romanNumeral = /^c{0,3}(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/u;

		if (word.length < 2 || !romanNumeral.test(word)) {
			return null;
		}

		const values = Array.from(word, (letter) => TitleText.#romanValues.get(letter) ?? 0);

		let total = 0;

		for (const [index, value] of values.entries()) {
			if (value < (values[index + 1] ?? 0)) {
				total -= value;
			} else {
				total += value;
			}
		}

		return total;
	}
}
