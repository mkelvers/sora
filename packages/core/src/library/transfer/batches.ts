/** Rows split so no statement outgrows the database's parameter limit. */
export class Batches<T> {
	/** Rows written by one statement. */
	static readonly #size = 1000;

	readonly #items: readonly T[];

	constructor(items: readonly T[]) {
		this.#items = items;
	}

	/** The rows, in order, in batches of at most 1000. */
	get all(): T[][] {
		return Array.from({ length: Math.ceil(this.#items.length / Batches.#size) }, (_, index) =>
			this.#items.slice(index * Batches.#size, (index + 1) * Batches.#size),
		);
	}
}
