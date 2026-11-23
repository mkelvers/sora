import { OpenAPIHono } from "@hono/zod-openapi";
import { profiles } from "@sora/core/auth";
import { recommendations, progress } from "@sora/core/library";

import { onInvalidRequest } from "../../errors";
import type { V1Env } from "../../errors";
import { contract } from "./contract";

/** The handlers for {@link contract}. */
export const handlers = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(contract.getProgress, async (c) => {
		const { profile_id, series_id, episode } = c.req.valid("param");
		const profile = await profiles.get(c.get("accountId"), profile_id);

		const results = await progress.get(profile.id, {
			episode,
			seriesId: series_id,
		});

		return c.json(
			{
				meta: {},
				results,
			},
			200,
		);
	})

	.openapi(contract.saveProgress, async (c) => {
		const { profile_id, series_id, episode } = c.req.valid("param");
		const profile = await profiles.get(c.get("accountId"), profile_id);

		const results = await progress.save(
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
				results,
			},
			200,
		);
	})

	.openapi(contract.getSeriesProgress, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await profiles.get(c.get("accountId"), profile_id);
		const results = await progress.series(profile.id, series_id);

		return c.json(
			{
				meta: {},
				results,
			},
			200,
		);
	})

	.openapi(contract.removeProgress, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await profiles.get(c.get("accountId"), profile_id);
		await progress.remove(profile.id, series_id);

		return c.body(null, 204);
	})

	.openapi(contract.markSeriesWatched, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await profiles.get(c.get("accountId"), profile_id);
		await progress.markWatched(profile.id, series_id);

		return c.body(null, 204);
	})

	.openapi(contract.markEpisodeWatched, async (c) => {
		const { profile_id, series_id, episode } = c.req.valid("param");
		const profile = await profiles.get(c.get("accountId"), profile_id);
		await progress.markWatched(profile.id, series_id, episode);

		return c.body(null, 204);
	})

	.openapi(contract.markEpisodeUnwatched, async (c) => {
		const { profile_id, series_id, episode } = c.req.valid("param");
		const profile = await profiles.get(c.get("accountId"), profile_id);
		await progress.markUnwatched(profile.id, {
			episode,
			seriesId: series_id,
		});

		return c.body(null, 204);
	})

	.openapi(contract.startRewatch, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await profiles.get(c.get("accountId"), profile_id);
		await progress.rewatch(profile.id, series_id);

		return c.body(null, 204);
	})

	.openapi(contract.listContinueWatching, async (c) => {
		const profile = await profiles.get(c.get("accountId"), c.req.valid("param").profile_id);
		const shows = await progress.continueWatching(profile.id);

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
		const profile = await profiles.get(c.get("accountId"), c.req.valid("param").profile_id);
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
		const profile = await profiles.get(c.get("accountId"), profile_id);
		await progress.dismiss(profile.id, series_id);

		return c.body(null, 204);
	});
