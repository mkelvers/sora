import { OpenAPIHono } from "@hono/zod-openapi";
import { auth } from "@sora/core/auth";
import { isWebClientKey } from "@sora/core/playback";
import { except } from "hono/combine";
import { createMiddleware } from "hono/factory";

import { clientAddress } from "./client-address";
import { onInvalidRequest, sendProblem } from "./errors";
import type { V1Env } from "./errors";
import { rateLimit } from "./rate-limit";
import { handlers as devicesHandlers } from "./resources/devices/handlers";
import { handlers as notificationsHandlers } from "./resources/notifications/handlers";
import { handlers as nowWatchingHandlers } from "./resources/now-watching/handlers";
import { contract as playback } from "./resources/playback/contract";
import { handlers as playbackHandlers } from "./resources/playback/handlers";
import { handlers as profilesHandlers } from "./resources/profiles/handlers";
import { handlers as progressHandlers } from "./resources/progress/handlers";
import { contract as series } from "./resources/series/contract";
import { handlers as seriesHandlers } from "./resources/series/handlers";
import { contract as transfer } from "./resources/transfer/contract";
import { handlers as transferHandlers } from "./resources/transfer/handlers";
import { handlers as watchlistHandlers } from "./resources/watchlist/handlers";

/**
 * Version 1 of the API: each resource's handlers, from `resources/`, behind
 * the middleware every route shares.
 * Session routes return `{ meta, results }`: the core's models,
 * in snake_case, under `results`, and facts about the response, such as
 * paging or the IDs it is for, under `meta`.
 *
 * A breaking change to any route belongs in a new version mounted next to
 * this one, never here: deployed clients keep calling `/v1`.
 */
const api = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
});

api.route("/", nowWatchingHandlers());

api.use("/auth/*", clientAddress);

// Sign-up, sign-in, and sign-out, answered by Better Auth itself.
api.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

// The portfolio route above uses its own secret. Everything below but sign-in needs an account, the contract and the stream proxy
// included, so nobody anonymous can make the server look anything up, and each
// account is held to a generous ceiling.
api.use(
	except(
		["/v1/auth/*"],
		// Answers 401 unless the request carries a session, as a bearer token or cookie.
		createMiddleware<V1Env>(async (c, proceed) => {
			const session = await auth.api.getSession({
				headers: c.req.raw.headers,
			});

			if (!session) {
				return sendProblem(c, 401, "UNAUTHORIZED", "Sign in to use this endpoint");
			}

			c.set("accountId", session.user.id);
			c.set("sessionId", session.session.id);
			c.header("Cache-Control", "private, no-store");
			await proceed();
		}),
		async (c, proceed) => {
			await proceed();
			const cacheControl = c.res.headers.get("Cache-Control");

			if (cacheControl?.startsWith("public")) {
				c.header("Cache-Control", cacheControl.replace("public", "private"));
			}
		},
	),
);

api.use(
	except(
		["/v1/auth/*", "/v1/streams/*"],
		rateLimit({
			limit: 600,
			windowMs: 60_000,
		}),
	),
);

/** Answers 403 unless the request carries the web app's key; see {@link isWebClientKey}. */
const webClient = createMiddleware<V1Env>(async (c, proceed) => {
	if (!isWebClientKey(c.req.header("X-Sora-Client-Key"))) {
		return sendProblem(c, 403, "FORBIDDEN", "Media is only served to the Sora web app");
	}

	await proceed();
});

// Media is served to the web app's own server and nothing else, for the
// account that asked, so neither a token nor an account is enough on its own.
// Segments arrive by the hundred, so streams have a ceiling of their own.
api.use(playback.getPlayback.getRoutingPath(), webClient);

api.use(
	playback.getStream.getRoutingPath(),
	webClient,
	rateLimit({
		limit: 3000,
		windowMs: 60_000,
	}),
);

// Routes that change what everyone sees or make the server call out to
// providers are limited further, so one account cannot spend the upstream
// budgets alone.
api.use(
	series.updateArtwork.getRoutingPath(),
	rateLimit({
		limit: 30,
		windowMs: 60_000,
	}),
);

api.use(
	series.refreshImages.getRoutingPath(),
	rateLimit({
		limit: 6,
		windowMs: 60_000,
	}),
);

api.use(
	series.upscaleBackdrop.getRoutingPath(),
	rateLimit({
		limit: 6,
		windowMs: 60_000,
	}),
);

api.use(
	transfer.importLibrary.getRoutingPath(),
	rateLimit({
		limit: 6,
		windowMs: 60_000,
	}),
);

api.use(
	series.listImages.getRoutingPath(),
	rateLimit({
		limit: 60,
		windowMs: 60_000,
	}),
);

api.use(
	playback.getPlayback.getRoutingPath(),
	rateLimit({
		limit: 60,
		windowMs: 60_000,
	}),
);

api.openAPIRegistry.registerComponent("securitySchemes", "session", {
	description: "The session token from `POST /v1/auth/sign-in/username`.",
	scheme: "bearer",
	type: "http",
});

export const v1 = api
	.route("/", seriesHandlers)
	.route("/", playbackHandlers)
	.route("/", devicesHandlers)
	.route("/", profilesHandlers)
	.route("/", transferHandlers)
	.route("/", progressHandlers)
	.route("/", watchlistHandlers)
	.route("/", notificationsHandlers);

api.doc31("/openapi.json", {
	info: {
		description:
			"Anime titles as AniList lists them: a show's seasons, films, and OVAs are each a title with its own episodes, found from one another as related titles, and addressed by Sora's own IDs. Every field and query parameter is in snake_case. A successful JSON response is `{ meta, results }`: facts about the response under `meta`, such as paging with `next` and `previous` links, and what was asked for under `results`, an object for one resource and an array for a list. The portfolio endpoint alone returns `{ titles }` with its own bearer secret. Errors are RFC 9457 problems (`application/problem+json`) with a stable `code`.",
		title: "Sora API",
		version: "1",
	},
	openapi: "3.1.0",
	servers: [
		{
			url: "/v1",
		},
	],
});
