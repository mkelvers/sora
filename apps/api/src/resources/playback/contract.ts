import { createRoute, z } from "@hono/zod-openapi";
import { PlaybackMediaSchema } from "@sora/core/models/playback";

import { envelopeOf } from "../../openapi/envelope";
import { json, PlaybackMetaSchema, problem, EpisodeParams } from "../../openapi/schemas";

/** Playing an episode: its playback and the stream proxy. */
export const playbackRoute = {
	getPlayback: createRoute({
		description:
			"Resolves streams for every version of the episode at once, such as sub and dub, each from the first provider that can play it, with its skip segments. Sources and subtitles are URLs a player fetches directly; they expire, so resolve again rather than storing them.",
		method: "get",
		operationId: "getPlayback",
		path: "/series/{series_id}/episodes/{episode}/playback",
		request: {
			params: EpisodeParams,
		},
		responses: {
			200: json(
				envelopeOf(
					z.array(PlaybackMediaSchema).openapi({
						description:
							"Every English version a provider can stream right now: dub before sub before raw, so the first is the one to play by default. A version no provider can stream right now is left out. A sub carries every subtitle language its provider has, English first, and always has English: as a track, or burned into the picture when `hardsub` is true. A dub carries the sub's WebVTT tracks retimed to its own encode, when the two encodes can be aligned. Raw has none.",
					}),
					PlaybackMetaSchema,
				),
				"Streams and skip segments for every version of the episode.",
			),
			404: problem("No such title, no such episode in it, or nothing streams it."),
			502: problem("Providers list the episode but none can stream it right now."),
		},
		summary: "Get everything needed to play an episode",
		tags: ["Playback"],
	}),
	getStream: createRoute({
		description:
			"Serves a playlist, segment, file, or subtitle through the stream proxy. `getPlayback` hands out these URLs. Only the Sora web app's server may call this and `getPlayback`, with its client key in `X-Sora-Client-Key`, for the account the token was issued to; players reach it through the web app, never directly. Playlists reference their children by relative token, so the token must stay the last path segment. `Range` is honoured for seeking.",
		method: "get",
		operationId: "getStream",
		path: "/streams/{token}",
		request: {
			params: z.object({
				token: z.string().openapi({
					param: {
						in: "path",
						name: "token",
					},
				}),
			}),
		},
		responses: {
			200: {
				content: {
					"application/octet-stream": {
						schema: z.string().openapi({
							format: "binary",
						}),
					},
					"application/vnd.apple.mpegurl": {
						schema: z.string(),
					},
				},
				description: "The resource.",
			},
			206: {
				description: "Part of the resource, for a `Range` request.",
			},
			403: problem("The token is forged, malformed, or expired."),
			502: problem("The upstream host failed."),
		},
		summary: "Fetch a stream resource",
		tags: ["Playback"],
	}),
};
