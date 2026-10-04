import { attempt } from "@sora/shared";

export class Preferences {
	constructor(private namespace: string) {}

	get(key: string): unknown {
		const { data } = attempt(
			() => JSON.parse(localStorage.getItem(this.#key(key)) ?? "null"),
			DOMException,
			SyntaxError,
		);
		return data;
	}

	set(key: string, value: unknown) {
		attempt(() => localStorage.setItem(this.#key(key), JSON.stringify(value)), DOMException);
	}

	#key(key: string) {
		return `sora:${this.namespace}:${key}`;
	}
}
