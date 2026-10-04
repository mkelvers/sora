import { attempt } from "@sora/shared";

/**
 * Work running per key, so concurrent callers asking for the same key share
 * one run instead of starting their own.
 *
 * A run is forgotten once it settles, whether it succeeded or failed, so the
 * next caller starts afresh.
 */
export class InFlight<TKey, TValue> {
	readonly #running = new Map<TKey, Promise<TValue>>();

	/** Whether work for `key` is running. */
	has(key: TKey): boolean {
		return this.#running.has(key);
	}

	/** The work running for `key`, or `start()` begun now and shared until it settles. */
	run(key: TKey, start: () => Promise<TValue>): Promise<TValue> {
		const running = this.#running.get(key);
		if (running) {
			return running;
		}

		const started = this.#forgetOnceSettled(key, start());
		this.#running.set(key, started);
		return started;
	}

	async #forgetOnceSettled(key: TKey, work: Promise<TValue>): Promise<TValue> {
		const { data, error } = await attempt(work);
		this.#running.delete(key);
		if (error) {
			throw error;
		}
		return data;
	}
}
