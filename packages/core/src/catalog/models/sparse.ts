/** A list as AniList's GraphQL returns it: possibly null, with null holes. */
export class Sparse<T> {
	readonly #values: readonly (T | null)[] | null | undefined;

	constructor(values: readonly (T | null)[] | null | undefined) {
		this.#values = values;
	}

	/** The values without holes; a null list is treated as empty. */
	get present(): T[] {
		if (this.#values) {
			return this.#values.filter((value): value is T => value !== null);
		}

		return [];
	}
}
