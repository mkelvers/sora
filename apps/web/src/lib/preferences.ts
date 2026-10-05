import { attempt } from "@sora/shared";

export class Preferences {
	constructor(private namespace: string) {}

	get(key: string): unknown {
		const storage = this.#storage();
		if (!storage) {
			return null;
		}

		const { data } = attempt(
			() => JSON.parse(storage.getItem(this.#key(key)) ?? "null"),
			DOMException,
			SyntaxError,
		);
		return data;
	}

	set(key: string, value: unknown) {
		const storage = this.#storage();
		if (!storage) {
			return;
		}

		attempt(() => storage.setItem(this.#key(key), JSON.stringify(value)), DOMException);
	}

	#storage(): Storage | undefined {
		return globalThis.localStorage;
	}

	#key(key: string) {
		return `sora:${this.namespace}:${key}`;
	}
}
