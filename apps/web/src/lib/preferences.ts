import { attempt } from "@sora/shared";

export class Preferences {
	#namespace: string;

	constructor(namespace: string) {
		this.#namespace = namespace;
	}

	get<T>(key: string, accepts: (value: unknown) => value is T, fallback: T): T {
		const { data, error } = attempt(
			() => JSON.parse(localStorage.getItem(this.#key(key)) ?? "null"),
			DOMException,
			SyntaxError,
		);
		if (error) {
			return fallback;
		}
		return accepts(data) ? data : fallback;
	}

	set(key: string, value: unknown) {
		attempt(() => localStorage.setItem(this.#key(key), JSON.stringify(value)), DOMException);
	}

	remove(key: string) {
		attempt(() => localStorage.removeItem(this.#key(key)), DOMException);
	}

	#key(key: string) {
		return `sora:${this.#namespace}:${key}`;
	}
}
