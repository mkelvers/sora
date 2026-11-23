import { OpenAPIHono } from "@hono/zod-openapi";
import { getProfile } from "@sora/core/auth";
import { ratings, watchlist } from "@sora/core/library";

import { onInvalidRequest } from "../../errors";
import type { V1Env } from "../../errors";
import { contract } from "./contract";

/** The handlers for {@link contract}. */
export const handlers = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(contract.listWatchlist, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const entries = await watchlist.list(profile.id);

		return c.json(
			{
				meta: {
					count: entries.length,
				},
				results: entries,
			},
			200,
		);
	})

	.openapi(contract.listWatchlistStatuses, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const entries = await watchlist.statuses(profile.id);

		return c.json(
			{
				meta: {
					count: entries.length,
				},
				results: entries,
			},
			200,
		);
	})

	.openapi(contract.getRating, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);

		return c.json(
			{
				meta: {},
				results: await ratings.get(profile.id, series_id),
			},
			200,
		);
	})

	.openapi(contract.setRating, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await ratings.set(profile.id, series_id, c.req.valid("json").rating);

		return c.body(null, 204);
	})

	.openapi(contract.removeRating, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await ratings.remove(profile.id, series_id);

		return c.body(null, 204);
	})

	.openapi(contract.setWatchlistStatus, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await watchlist.set(profile.id, series_id, c.req.valid("json").status);

		return c.body(null, 204);
	})

	.openapi(contract.removeFromWatchlist, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await watchlist.remove(profile.id, series_id);

		return c.body(null, 204);
	});
