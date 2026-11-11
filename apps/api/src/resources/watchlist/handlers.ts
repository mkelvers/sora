import { OpenAPIHono } from "@hono/zod-openapi";
import { getProfile } from "@sora/core/auth";
import {
	getRating,
	getWatchlist,
	getWatchlistStatuses,
	removeFromWatchlist,
	removeRating,
	setRating,
	setWatchlistStatus,
} from "@sora/core/library";

import { onInvalidRequest } from "../../errors";
import type { V1Env } from "../../errors";
import { watchlistRoute } from "./contract";

/** The handlers for {@link watchlistRoute}. */
export const watchlistRoutes = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(watchlistRoute.listWatchlist, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const entries = await getWatchlist(profile.id);
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

	.openapi(watchlistRoute.listWatchlistStatuses, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const entries = await getWatchlistStatuses(profile.id);
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

	.openapi(watchlistRoute.getRating, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		return c.json(
			{
				meta: {},
				results: await getRating(profile.id, series_id),
			},
			200,
		);
	})

	.openapi(watchlistRoute.setRating, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await setRating(profile.id, series_id, c.req.valid("json").rating);
		return c.body(null, 204);
	})

	.openapi(watchlistRoute.removeRating, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await removeRating(profile.id, series_id);
		return c.body(null, 204);
	})

	.openapi(watchlistRoute.setWatchlistStatus, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await setWatchlistStatus(profile.id, series_id, c.req.valid("json").status);
		return c.body(null, 204);
	})

	.openapi(watchlistRoute.removeFromWatchlist, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await removeFromWatchlist(profile.id, series_id);
		return c.body(null, 204);
	});
