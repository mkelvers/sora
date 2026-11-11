import { OpenAPIHono } from "@hono/zod-openapi";
import { auth } from "@sora/core/auth";
import { isWebClientKey } from "@sora/core/playback";
import { attempt } from "@sora/shared";
import type { Context } from "hono";
import { except } from "hono/combine";
import { createMiddleware } from "hono/factory";

import { addressOf, clientAddress } from "./client-address";
import { onInvalidRequest, sendProblem } from "./errors";
import type { V1Env } from "./errors";
import { rateLimit } from "./rate-limit";
import { deviceRoutes } from "./resources/devices/handlers";
import { notificationRoutes } from "./resources/notifications/handlers";
import { nowWatchingRoutes } from "./resources/now-watching/handlers";
import { playbackRoute } from "./resources/playback/contract";
import { playbackRoutes } from "./resources/playback/handlers";
import { profileRoutes } from "./resources/profiles/handlers";
import { progressRoutes } from "./resources/progress/handlers";
import { seriesRoute } from "./resources/series/contract";
import { seriesRoutes } from "./resources/series/handlers";
import { transferRoute } from "./resources/transfer/contract";
import { transferRoutes } from "./resources/transfer/handlers";
import { watchlistRoutes } from "./resources/watchlist/handlers";

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
const v1 = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
});

v1.route("/", nowWatchingRoutes());

v1.use("/auth/*", clientAddress);

// Wrong passwords are limited per username as well as per client
// address (Better Auth does that one), so guessing at one account does not
// get easier by changing address. The limit for one address and username stops
// one client from guessing, and cannot shut the owner out from another
// address. The one for the username alone only bounds guessing from many
// addresses at once, which is also the only way to keep it full.
const signInUsername = async (c: Context<V1Env>) => {
	const { data } = await attempt(
		c.req.raw.clone().json() as Promise<{ username?: unknown }>,
		SyntaxError,
	);
	return typeof data?.username === "string" ? data.username.trim().toLowerCase().slice(0, 30) : "";
};
v1.use(
	"/auth/sign-in/username",
	rateLimit({
		key: async (c) => `sign-in:${addressOf(c.req.raw)}:${await signInUsername(c)}`,
		limit: 10,
		windowMs: 60_000,
	}),
	rateLimit({
		key: async (c) => `sign-in:${await signInUsername(c)}`,
		limit: 60,
		windowMs: 60_000,
	}),
);

// Sign-up, sign-in, and sign-out, answered by Better Auth itself.
v1.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

/** Answers 401 unless the request carries a session, as a bearer token or cookie. */
const signedIn = createMiddleware<V1Env>(async (c, proceed) => {
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
});

// The portfolio route above uses its own secret. Everything below but sign-in needs an account, the contract and the stream proxy
// included, so nobody anonymous can make the server look anything up, and each
// account is held to a generous ceiling.
v1.use(
	except(["/v1/auth/*"], signedIn, async (c, proceed) => {
		await proceed();
		const cacheControl = c.res.headers.get("Cache-Control");
		if (cacheControl?.startsWith("public")) {
			c.header("Cache-Control", cacheControl.replace("public", "private"));
		}
	}),
);
v1.use(
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
v1.use(playbackRoute.getPlayback.getRoutingPath(), webClient);
v1.use(
	playbackRoute.getStream.getRoutingPath(),
	webClient,
	rateLimit({
		limit: 3000,
		windowMs: 60_000,
	}),
);

// Routes that change what everyone sees or make the server call out to
// providers are limited further, so one account cannot spend the upstream
// budgets alone.
v1.use(
	seriesRoute.updateArtwork.getRoutingPath(),
	rateLimit({
		limit: 30,
		windowMs: 60_000,
	}),
);
v1.use(
	seriesRoute.refreshImages.getRoutingPath(),
	rateLimit({
		limit: 6,
		windowMs: 60_000,
	}),
);
v1.use(
	seriesRoute.upscaleBackdrop.getRoutingPath(),
	rateLimit({
		limit: 6,
		windowMs: 60_000,
	}),
);
v1.use(
	transferRoute.importLibrary.getRoutingPath(),
	rateLimit({
		limit: 6,
		windowMs: 60_000,
	}),
);
v1.use(
	seriesRoute.listImages.getRoutingPath(),
	rateLimit({
		limit: 60,
		windowMs: 60_000,
	}),
);
v1.use(
	playbackRoute.getPlayback.getRoutingPath(),
	rateLimit({
		limit: 60,
		windowMs: 60_000,
	}),
);

v1.openAPIRegistry.registerComponent("securitySchemes", "session", {
	description: "The session token from `POST /v1/auth/sign-in/username`.",
	scheme: "bearer",
	type: "http",
});

export const v1Routes = v1
	.route("/", seriesRoutes)
	.route("/", playbackRoutes)
	.route("/", deviceRoutes)
	.route("/", profileRoutes)
	.route("/", transferRoutes)
	.route("/", progressRoutes)
	.route("/", watchlistRoutes)
	.route("/", notificationRoutes);

v1.doc31("/openapi.json", {
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
