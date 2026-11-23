import { OpenAPIHono } from "@hono/zod-openapi";
import { getProfile } from "@sora/core/auth";
import {
	dismissContinueWatching,
	getContinueWatching,
	getProgress,
	getSeriesProgress,
	markUnwatched,
	markWatched,
	removeProgress,
	saveProgress,
	startRewatch,
	recommendations,
} from "@sora/core/library";

import { onInvalidRequest } from "../../errors";
import type { V1Env } from "../../errors";
import { contract } from "./contract";

/** The handlers for {@link contract}. */
export const handlers = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(contract.getProgress, async (c) => {
		const { profile_id, series_id, episode } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);

		const progress = await getProgress(profile.id, {
			episode,
			seriesId: series_id,
		});

		return c.json(
			{
				meta: {},
				results: progress,
			},
			200,
		);
	})

	.openapi(contract.saveProgress, async (c) => {
		const { profile_id, series_id, episode } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);

		const progress = await saveProgress(
			profile.id,
			{
				episode,
				seriesId: series_id,
			},
			c.req.valid("json"),
		);

		return c.json(
			{
				meta: {},
				results: progress,
			},
			200,
		);
	})

	.openapi(contract.getSeriesProgress, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		const progress = await getSeriesProgress(profile.id, series_id);

		return c.json(
			{
				meta: {},
				results: progress,
			},
			200,
		);
	})

	.openapi(contract.removeProgress, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await removeProgress(profile.id, series_id);

		return c.body(null, 204);
	})

	.openapi(contract.markSeriesWatched, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await markWatched(profile.id, series_id);

		return c.body(null, 204);
	})

	.openapi(contract.markEpisodeWatched, async (c) => {
		const { profile_id, series_id, episode } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await markWatched(profile.id, series_id, episode);

		return c.body(null, 204);
	})

	.openapi(contract.markEpisodeUnwatched, async (c) => {
		const { profile_id, series_id, episode } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await markUnwatched(profile.id, {
			episode,
			seriesId: series_id,
		});

		return c.body(null, 204);
	})

	.openapi(contract.startRewatch, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await startRewatch(profile.id, series_id);

		return c.body(null, 204);
	})

	.openapi(contract.listContinueWatching, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const shows = await getContinueWatching(profile.id);

		return c.json(
			{
				meta: {
					count: shows.length,
				},
				results: shows,
			},
			200,
		);
	})

	.openapi(contract.listRecommendations, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const rows = await recommendations.list(profile.id);

		return c.json(
			{
				meta: {
					count: rows.length,
				},
				results: rows,
			},
			200,
		);
	})

	.openapi(contract.dismissContinueWatching, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await dismissContinueWatching(profile.id, series_id);

		return c.body(null, 204);
	});
