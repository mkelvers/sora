import { defined } from "@sora/shared";

/** A title, compared with others by its letters and digits. */
export class Name {
	/** A release qualifier a title ends with, such as `(TV)` or `(Web)`. */
	static readonly qualifier = /\s*\((?:TV|Web|ONA)\)$/iu;

	readonly #text: string;

	constructor(text: string) {
		this.#text = text;
	}

	/** The title without a `(TV)` it ends with. */
	get plain() {
		return this.#text.replace(/\s*\(TV\)$/iu, "");
	}

	/**
	 * The name a story's seasons share: the title without the qualifiers and
	 * numbering it ends with, so The Seven Deadly Sins: Grudge of Edinburgh
	 * Part 2 is `Part 2` after Part 1.
	 */
	get story() {
		/** Numbering a title ends with, such as `Part 1`, `Season 1`, or `1st Season`. */
		const numbering = /[\s:-]+(?:Season\s+\d+|\d+(?:st|nd|rd|th)\s+Season|Part\s+\d+)$/iu;

		let name = this.#text;

		for (let previous = ""; previous !== name;) {
			previous = name;
			name = name.replace(Name.qualifier, "").replace(numbering, "");
		}

		return name;
	}

	static #isWordCharacter(character: string) {
		return /[\p{L}\p{N}]/u.test(character);
	}

	/**
	 * The title after `prefix`, matching letters and digits case-insensitively
	 * and skipping everything else, with the punctuation and spaces it then
	 * starts with removed; `null` when the title does not start with `prefix`.
	 */
	without(prefix: string) {
		const wanted = [...prefix.toLowerCase()].filter((character) =>
			Name.#isWordCharacter(character),
		);

		const characters = [...this.#text];
		let index = 0;

		for (const expected of wanted) {
			while (index < characters.length && !Name.#isWordCharacter(defined(characters[index]))) {
				index += 1;
			}

			if (characters[index]?.toLowerCase() !== expected) {
				return null;
			}

			index += 1;
		}

		if (index < characters.length && Name.#isWordCharacter(defined(characters[index]))) {
			return null;
		}

		return characters
			.slice(index)
			.join("")
			.replace(/^[^\p{L}\p{N}]+/u, "");
	}
}
