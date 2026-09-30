export class Preferences {
	#namespace: string;

	constructor(namespace: string) {
		this.#namespace = namespace;
	}

	get<T>(key: string, accepts: (value: unknown) => value is T, fallback: T): T {
		try {
			const stored: unknown = JSON.parse(localStorage.getItem(this.#key(key)) ?? "null");

			return accepts(stored) ? stored : fallback;
		} catch {
			return fallback;
		}
	}

	set(key: string, value: unknown) {
		try {
			localStorage.setItem(this.#key(key), JSON.stringify(value));
		} catch {
			return;
		}
	}

	remove(key: string) {
		try {
			localStorage.removeItem(this.#key(key));
		} catch {
			return;
		}
	}

	#key(key: string) {
		return `sora:${this.#namespace}:${key}`;
	}
}
