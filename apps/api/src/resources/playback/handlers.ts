import { OpenAPIHono } from "@hono/zod-openapi";
import { proxyStream, resolvePlayback } from "@sora/core/playback";
import { getAdjacentEpisodes } from "@sora/core/series";

import { onInvalidRequest } from "../../errors";
import type { V1Env } from "../../errors";
import { playbackRoute } from "./contract";

/** An episode's playback URL, relative to the API's origin. */
const playbackPath = (seriesId: string, episode: number) =>
	`/v1/series/${seriesId}/episodes/${episode}/playback`;

/** The handlers for {@link playbackRoute}. */
export const playbackRoutes = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(playbackRoute.getPlayback, async (c) => {
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
		return c.json(
			{
				meta: {
					episode,
					expires_at: playback.expiresAt,
					next: adjacent.next === null ? null : playbackPath(series_id, adjacent.next),
					next_episode: adjacent.next,
					previous: adjacent.previous === null ? null : playbackPath(series_id, adjacent.previous),
					previous_episode: adjacent.previous,
					series_id,
				},
				results: playback.media,
			},
			200,
		);
	})

	.openapi(playbackRoute.getStream, (c) =>
		proxyStream(c.req.valid("param").token, {
			accountId: c.get("accountId"),
			range: c.req.header("range") ?? null,
			signal: c.req.raw.signal,
		}),
	);
