import { formatRetryAfter, minute } from "@sora/shared";
import { APIError } from "better-auth/api";

/**
 * Sign-in attempts counted in fixed one-minute windows, one per key. At
 * 10,000 windows, new keys wait for one to expire.
 */
export class Attempts {
	readonly #windows = new Map<
		string,
		{
			count: number;
			expiresAt: number;
		}
	>();

	/**
	 * Counts an attempt for `key`.
	 *
	 * @throws {APIError} `TOO_MANY_REQUESTS` when `key` has made `limit`
	 *   attempts this window, or no window is left for a new key.
	 */
	count(key: string, limit: number) {
		const maxBuckets = 10_000;

		const now = performance.now();
		// All windows have the same duration, so insertion order is expiry order.
		let oldest = this.#windows.entries().next().value;

		while (oldest && oldest[1].expiresAt <= now) {
			this.#windows.delete(oldest[0]);
			oldest = this.#windows.entries().next().value;
		}

		const window = this.#windows.get(key);

		if (!window) {
			if (oldest && this.#windows.size >= maxBuckets) {
				Attempts.#reject(oldest[1].expiresAt, now);
			}

			this.#windows.set(key, {
				count: 1,
				expiresAt: now + minute,
			});

			return;
		}

		if (window.count >= limit) {
			Attempts.#reject(window.expiresAt, now);
		}

		window.count += 1;
	}

	static #reject(expiresAt: number, now: number): never {
		const retryAfter = formatRetryAfter(expiresAt - now);
		throw new APIError(
			"TOO_MANY_REQUESTS",
			{
				code: "TOO_MANY_REQUESTS",
				message: "Too many requests; try again shortly",
			},
			{
				"Cache-Control": "no-store",
				"Retry-After": retryAfter,
				"X-Retry-After": retryAfter,
			},
		);
	}
}
