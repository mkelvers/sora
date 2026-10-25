import { isWebClientKey } from "@sora/core/playback";
import { attempt } from "@sora/shared";
import { getConnInfo } from "hono/bun";
import { createMiddleware } from "hono/factory";

import type { V1Env } from "./errors";

/**
 * Makes `X-Forwarded-For` mean what sign-in limits assume: the address of
 * whoever is signing in, as the web app saw it.
 *
 * Only the web app, which proves itself with the client key, may say so. A
 * request without the key has its `X-Forwarded-For` replaced by the address
 * it connected from, so nobody who can reach the API directly can pick the
 * address its limits count against.
 */
export const clientAddress = createMiddleware<V1Env>(async (c, next) => {
	if (!isWebClientKey(c.req.header("X-Sora-Client-Key"))) {
		const { data: address } = attempt(() => getConnInfo(c).remote.address, TypeError);
		const headers = new Headers(c.req.raw.headers);
		headers.set("X-Forwarded-For", address ?? "unknown");
		c.req.raw = new Request(c.req.raw, {
			headers,
		});
	}

	await next();
});

/** The address a request's limits count against, once {@link clientAddress} has run. */
export const addressOf = (request: Request) =>
	request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
