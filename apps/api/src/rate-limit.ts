import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { sendProblem, type V1Env } from "./errors";

/** The most counters one limiter keeps before it sweeps the expired ones. */
const sweepAbove = 10_000;

interface RateLimitOptions {
	/** How many requests one key may make in a window. */
	limit: number;
	/** How long a window lasts, in milliseconds. */
	windowMs: number;
	/** Who a request counts against; the signed-in account when left out. */
	key?: (c: Context<V1Env>) => string | Promise<string>;
}

/**
 * Answers 429 once a key has made `limit` requests within `windowMs`,
 * counted per limiter in fixed windows. Without a `key` it counts the
 * signed-in account, so use it after `signedIn`; each instance counts for
 * itself.
 *
 * `Retry-After` says how many seconds remain in the window.
 */
export function rateLimit({ limit, windowMs, key }: RateLimitOptions) {
	const windows = new Map<
		string,
		{
			count: number;
			resetAt: number;
		}
	>();

	return createMiddleware<V1Env>(async (c: Context<V1Env>, next) => {
		const now = Date.now();
		if (windows.size > sweepAbove) {
			for (const [counted, window] of windows) {
				if (window.resetAt <= now) {
					windows.delete(counted);
				}
			}
		}

		const counted = key ? await key(c) : c.get("accountId");
		let window = windows.get(counted);
		if (!window || window.resetAt <= now) {
			window = {
				count: 0,
				resetAt: now + windowMs,
			};
			windows.set(counted, window);
		}

		window.count += 1;
		if (window.count > limit) {
			const response = sendProblem(
				c,
				429,
				"TOO_MANY_REQUESTS",
				"Too many requests; try again shortly",
			);
			response.headers.set("Retry-After", String(Math.ceil((window.resetAt - now) / 1_000)));
			return response;
		}

		await next();
	});
}
