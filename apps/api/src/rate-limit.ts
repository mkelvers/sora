import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { sendProblem, type V1Env } from "./errors";

/** The most counters one limiter keeps before it sweeps the expired ones. */
const sweepAbove = 10_000;

interface RateLimitOptions {
	/** How many requests one account may make in a window. */
	limit: number;
	/** How long a window lasts, in milliseconds. */
	windowMs: number;
}

/**
 * Answers 429 once an account has made `limit` requests within `windowMs`,
 * counted per limiter in fixed windows. Use it after `signedIn`, whose
 * account it counts; each instance counts for itself.
 *
 * `Retry-After` says how many seconds remain in the window.
 */
export function rateLimit({ limit, windowMs }: RateLimitOptions) {
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
			for (const [account, window] of windows) {
				if (window.resetAt <= now) {
					windows.delete(account);
				}
			}
		}

		const accountId = c.get("accountId");
		let window = windows.get(accountId);
		if (!window || window.resetAt <= now) {
			window = {
				count: 0,
				resetAt: now + windowMs,
			};
			windows.set(accountId, window);
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
