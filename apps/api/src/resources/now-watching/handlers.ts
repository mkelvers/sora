import { createHash, timingSafeEqual } from "node:crypto";

import { OpenAPIHono } from "@hono/zod-openapi";
import { getNowWatching } from "@sora/core/library";
import { z } from "zod";

import { sendProblem } from "../../errors";
import type { V1Env } from "../../errors";
import { rateLimit } from "../../rate-limit";
import { nowWatchingRoute } from "./contract";

const EnvironmentSchema = z.object({
	NOW_WATCHING_PROFILE_ID: z.string().optional(),
	PORTFOLIO_TOKEN: z.string().optional(),
});

/** Shared-secret access for the portfolio, independent of account sessions. */
export const nowWatchingRoutes = (
	readTitles = getNowWatching,
	environment = EnvironmentSchema.parse(process.env),
) => {
	const app = new OpenAPIHono<V1Env>();
	app.openAPIRegistry.registerComponent("securitySchemes", "portfolio", {
		description: "The server-only PORTFOLIO_TOKEN.",
		scheme: "bearer",
		type: "http",
	});
	app.use(nowWatchingRoute.getNowWatching.getRoutingPath(), async (c, proceed) => {
		c.header("Cache-Control", "no-store");
		if (!environment.PORTFOLIO_TOKEN) {
			return sendProblem(c, 404, "NOT_FOUND", `No endpoint matches ${c.req.method} ${c.req.path}`);
		}
		const expected = createHash("sha256").update(`Bearer ${environment.PORTFOLIO_TOKEN}`).digest();
		const actual = createHash("sha256")
			.update(c.req.header("Authorization") ?? "")
			.digest();
		if (!timingSafeEqual(expected, actual)) {
			return sendProblem(c, 401, "UNAUTHORIZED", "Unauthorized");
		}
		await proceed();
	});
	app.use(
		nowWatchingRoute.getNowWatching.getRoutingPath(),
		rateLimit({
			key: () => "portfolio",
			limit: 60,
			windowMs: 60_000,
		}),
	);
	return app.openapi(nowWatchingRoute.getNowWatching, async (c) =>
		c.json(
			{
				titles: environment.NOW_WATCHING_PROFILE_ID
					? await readTitles(environment.NOW_WATCHING_PROFILE_ID)
					: [],
			},
			200,
		),
	);
};
