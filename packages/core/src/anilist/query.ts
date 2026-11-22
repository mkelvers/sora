import { createHash } from "node:crypto";

import type { Json } from "@sora/shared";

/** The text of an AniList operation, as sent in a request. */
export class Query {
	readonly #text: string;

	constructor(text: string) {
		this.#text = text;
	}

	/**
	 * The operation's name.
	 *
	 * @throws {TypeError} when the document is not a named operation.
	 */
	get name(): string {
		const name = /\b(?:query|mutation)\s+(?<name>\w+)/u.exec(this.#text)?.[1];

		if (!name) {
			throw new TypeError("AniList documents must be named operations");
		}

		return name;
	}

	/**
	 * A stable key for this query asked with `variables`.
	 *
	 * Object keys are sorted so `{ a, b }` and `{ b, a }` share a stored response, and the
	 * query text is included so editing an operation leaves its stored responses behind.
	 */
	key<TVariables>(variables: TVariables): string {
		return createHash("sha256")
			.update(this.#text)
			.update("\0")
			.update(JSON.stringify(variables, Query.#sorted) ?? "null")
			.digest("hex");
	}

	static #sorted(_key: string, value: Json | undefined) {
		if (!(value instanceof Object) || Array.isArray(value)) {
			return value;
		}

		return Object.fromEntries(
			Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right)),
		);
	}
}
