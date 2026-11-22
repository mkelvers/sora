import { browser } from "$app/env";
import { attempt } from "@sora/shared";
import type { z } from "zod";

export class Preferences {
	private readonly namespace: string;

	constructor(namespace: string) {
		this.namespace = namespace;
	}

	get<TValue>(key: string, schema: z.ZodType<TValue>): TValue | null {
		if (!browser) {
			return null;
		}

		const { data } = attempt(
			() => JSON.parse(localStorage.getItem(this.#key(key)) ?? "null"),
			DOMException,
			SyntaxError,
		);
		const parsed = schema.safeParse(data);

		if (!parsed.success) {
			return null;
		}

		return parsed.data;
	}

	set(key: string, value: unknown) {
		if (!browser) {
			return;
		}

		attempt(() => localStorage.setItem(this.#key(key), JSON.stringify(value)), DOMException);
	}

	#key(key: string) {
		return `sora:${this.namespace}:${key}`;
	}
}
