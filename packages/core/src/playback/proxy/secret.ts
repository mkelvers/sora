import { createHash } from "node:crypto";

/** The secret stream tokens are sealed with. */
export class Secret {
	readonly #value: string;

	constructor(value: string) {
		this.#value = value;
	}

	/** The AES-256 key made from the secret. */
	get key() {
		const hash = createHash("sha256");

		return hash.update(`sora stream token\0${this.#value}`).digest();
	}
}
