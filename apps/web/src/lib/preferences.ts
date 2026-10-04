import { attempt } from "@sora/attempt";

export class Preferences {
	#namespace: string;

	constructor(namespace: string) {
		this.#namespace = namespace;
	}

	get<T>(key: string, accepts: (value: unknown) => value is T, fallback: T): T {
		const { data: stored, error } = attempt((): unknown =>
			JSON.parse(localStorage.getItem(this.#key(key)) ?? "null"),
		);
		if (error instanceof DOMException || error instanceof SyntaxError) {
			return fallback;
		}
		if (error) {
			throw error;
		}
		return accepts(stored) ? stored : fallback;
	}

	set(key: string, value: unknown) {
		const { error } = attempt(() => localStorage.setItem(this.#key(key), JSON.stringify(value)));
		if (error && !(error instanceof DOMException)) {
			throw error;
		}
	}

	remove(key: string) {
		const { error } = attempt(() => localStorage.removeItem(this.#key(key)));
		if (error && !(error instanceof DOMException)) {
			throw error;
		}
	}

	#key(key: string) {
		return `sora:${this.#namespace}:${key}`;
	}
}
