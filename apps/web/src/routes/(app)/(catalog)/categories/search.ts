/** Matches category names and values using case-insensitive, ordered characters. */
export class CategorySearch {
	readonly #words: string[];

	constructor(query: string) {
		this.#words = query.toLocaleLowerCase().trim().split(/\s+/u);
	}

	matches(label: string): boolean {
		const text = label.toLocaleLowerCase();

		return this.#words.every((word) => {
			let position = 0;

			for (const character of word) {
				const found = text.indexOf(character, position);

				if (found === -1) {
					return false;
				}

				position = found + 1;
			}

			return true;
		});
	}
}
