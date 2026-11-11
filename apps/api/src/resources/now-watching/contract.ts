import { createRoute, z } from "@hono/zod-openapi";

import { json, problem } from "../../openapi/schemas";

/** What the portfolio shows the profile is watching. */
export const nowWatchingRoute = {
	getNowWatching: createRoute({
		description:
			"Up to three recently watched, unfinished titles from the configured portfolio profile. Unlike session routes, returns only titles.",
		method: "get",
		operationId: "getNowWatching",
		path: "/public/now-watching",
		responses: {
			200: json(z.object({ titles: z.array(z.string()).max(3) }), "Recently watched titles."),
			401: problem("Unauthorized."),
			404: problem("Endpoint disabled."),
			429: problem("Too many requests."),
		},
		security: [{ portfolio: [] }],
		tags: ["Portfolio"],
	}),
};
