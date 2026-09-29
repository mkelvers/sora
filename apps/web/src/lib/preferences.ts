import * as z from "zod/mini";

export class Preferences {
	#namespace: string;

	constructor(namespace: string) {
		this.#namespace = namespace;
	}

	get<T>(key: string, schema: z.core.$ZodType<T>, fallback: T): T {
		try {
			const stored = z.safeParse(
				schema,
				JSON.parse(localStorage.getItem(this.#key(key)) ?? "null"),
			);

			return stored.success ? stored.data : fallback;
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
