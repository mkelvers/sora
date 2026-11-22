import { OpenAPIHono } from "@hono/zod-openapi";
import { proxyStream, resolvePlayback } from "@sora/core/playback";
import { getAdjacentEpisodes } from "@sora/core/series";

import { onInvalidRequest } from "../../errors";
import type { V1Env } from "../../errors";
import { contract } from "./contract";

/** The handlers for {@link contract}. */
export const handlers = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(contract.getPlayback, async (c) => {
		const { series_id, episode } = c.req.valid("param");
		// Absolute, so players on any origin can fetch it.
		const streamBaseUrl = new URL("/v1/streams", c.req.url);
		// Behind a TLS-terminating proxy the API itself is reached over HTTP.
		const protocol = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();

		if (protocol === "https" || protocol === "http") {
			streamBaseUrl.protocol = protocol;
		}

		const [playback, adjacent] = await Promise.all([
			resolvePlayback(
				{
					episode,
					seriesId: series_id,
				},
				{
					accountId: c.get("accountId"),
					streamBaseUrl: streamBaseUrl.href,
				},
			),
			getAdjacentEpisodes(series_id, episode),
		]);

		// Stream URLs expire; a cached playback would hand out dead ones.
		c.header("Cache-Control", "no-store");

		// An episode's playback URL, relative to the API's origin.
		const path = (number: number) => `/v1/series/${series_id}/episodes/${number}/playback`;

		let next: string | null = null;

		if (adjacent.next !== null) {
			next = path(adjacent.next);
		}

		let previous: string | null = null;

		if (adjacent.previous !== null) {
			previous = path(adjacent.previous);
		}

		return c.json(
			{
				meta: {
					episode,
					expires_at: playback.expiresAt,
					next,
					next_episode: adjacent.next,
					previous,
					previous_episode: adjacent.previous,
					series_id,
				},
				results: playback.media,
			},
			200,
		);
	})

	.openapi(contract.getStream, (c) =>
		proxyStream(c.req.valid("param").token, {
			accountId: c.get("accountId"),
			range: c.req.header("range") ?? null,
			signal: c.req.raw.signal,
		}),
	);
