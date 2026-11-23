/** An identifier as the words it is made of: `migrateDatabase` reads as `migrate`, `database`. */
export class Name {
	readonly #text: string;

	constructor(text: string) {
		this.#text = text;
	}

	/** The identifier's words, lower-cased, without leading `#`, `_` or `$`. */
	get words(): string[] {
		const words = this.#text
			.replace(/^[#_$]+/u, "")
			.split(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_$-]+/u)
			.filter(Boolean);

		return words.map((word) => word.toLowerCase());
	}

	toString(): string {
		return this.#text;
	}
}
