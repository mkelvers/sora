import { OpenAPIHono } from "@hono/zod-openapi";
import { currentSeason, getGenres, listSeasons } from "@sora/core/catalog";
import {
	browseSeries,
	getAiringSchedule,
	getCalendar,
	getLatestReleases,
	getSeries,
	getSeriesEpisode,
	getSeriesEpisodePage,
	getSeriesEpisodes,
	getUpcomingSeries,
	getUpscaledBackdrop,
	listSeriesImages,
	refreshSeriesImages,
	requestBackdropUpscale,
	setSeriesArtwork,
} from "@sora/core/series";
import { day } from "@sora/shared";

import { onInvalidRequest, sendProblem } from "../../errors";
import type { V1Env } from "../../errors";
import { offsetLinks, pageMeta } from "../../openapi/envelope";
import { seriesRoute } from "./contract";

/** The handlers for {@link seriesRoute}. */
export const seriesRoutes = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(seriesRoute.browseSeries, async (c) => {
		const { season_year, per_page, ...filters } = c.req.valid("query");
		const page = await browseSeries({
			...filters,
			perPage: per_page,
			seasonYear: season_year,
		});
		c.header("Cache-Control", "public, max-age=300");
		return c.json(
			{
				meta: pageMeta(c.req.url, page),
				results: page.items,
			},
			200,
		);
	})

	.openapi(seriesRoute.searchSeries, async (c) => {
		const { q, season_year, per_page, ...filters } = c.req.valid("query");
		const page = await browseSeries({
			...filters,
			perPage: per_page,
			search: q,
			seasonYear: season_year,
		});
		c.header("Cache-Control", "public, max-age=60");
		return c.json(
			{
				meta: pageMeta(c.req.url, page),
				results: page.items,
			},
			200,
		);
	})

	.openapi(seriesRoute.getSeries, async (c) => {
		const series = await getSeries(c.req.valid("param").series_id);
		if (!c.req.valid("query").episodes) {
			c.header("Cache-Control", "public, max-age=300");
			return c.json(
				{
					meta: {},
					results: series,
				},
				200,
			);
		}

		const episodes = await getSeriesEpisodes(series.id);
		// Unknown audio is filled in once providers are looked up.
		c.header(
			"Cache-Control",
			episodes.some((episode) => episode.audio === null) ? "no-store" : "public, max-age=300",
		);
		return c.json(
			{
				meta: {},
				results: {
					...series,
					episodes,
				},
			},
			200,
		);
	})

	.openapi(seriesRoute.listImages, async (c) => {
		const { type, language, sort } = c.req.valid("query");
		const images = await listSeriesImages(c.req.valid("param").series_id, {
			languages: language,
			sort,
			types: type,
		});
		return c.json(
			{
				meta: {
					count: images.length,
				},
				results: images,
			},
			200,
		);
	})

	.openapi(seriesRoute.refreshImages, async (c) => {
		const images = await refreshSeriesImages(c.req.valid("param").series_id);
		return c.json(
			{
				meta: {
					count: images.length,
				},
				results: images,
			},
			200,
		);
	})

	.openapi(seriesRoute.upscaleBackdrop, async (c) => {
		const { series_id: seriesId } = c.req.valid("param");
		await requestBackdropUpscale(seriesId, c.req.valid("json").url);
		const images = await listSeriesImages(seriesId);
		return c.json(
			{
				meta: {
					count: images.length,
				},
				results: images,
			},
			200,
		);
	})

	.openapi(seriesRoute.getBackdrop, async (c) => {
		const image = await getUpscaledBackdrop(c.req.valid("param").id);
		if (!image) {
			return sendProblem(c, 404, "NOT_FOUND", "No such backdrop");
		}

		return new Response(Buffer.from(image), {
			headers: {
				// An upscale is never changed once made.
				"Cache-Control": "private, max-age=31536000, immutable",
				"Content-Type": "image/jpeg",
			},
		});
	})

	.openapi(seriesRoute.updateArtwork, async (c) => {
		const series = await setSeriesArtwork(c.req.valid("param").series_id, c.req.valid("json"));
		return c.json(
			{
				meta: {},
				results: series,
			},
			200,
		);
	})

	.openapi(seriesRoute.listEpisodes, async (c) => {
		const { series_id } = c.req.valid("param");
		const { offset = 0, limit } = c.req.valid("query");
		const { episodes, total } = await getSeriesEpisodePage(series_id, {
			limit: limit ?? Number.MAX_SAFE_INTEGER,
			offset,
		});
		const size = limit ?? Math.max(total - offset, 1);
		// Unknown audio is filled in once providers are looked up.
		c.header(
			"Cache-Control",
			episodes.some((episode) => episode.audio === null) ? "no-store" : "public, max-age=300",
		);
		return c.json(
			{
				meta: {
					limit: size,
					offset,
					series_id,
					total,
					...offsetLinks(c.req.url, {
						limit: size,
						offset,
						total,
					}),
				},
				results: episodes,
			},
			200,
		);
	})

	.openapi(seriesRoute.getEpisode, async (c) => {
		const { series_id, episode } = c.req.valid("param");
		return c.json(
			{
				meta: {},
				results: await getSeriesEpisode(series_id, episode),
			},
			200,
		);
	})

	.openapi(seriesRoute.listGenres, async (c) => {
		const genres = await getGenres();
		c.header("Cache-Control", "public, max-age=86400");
		return c.json(
			{
				meta: {
					count: genres.length,
				},
				results: genres,
			},
			200,
		);
	})

	.openapi(seriesRoute.getSchedule, async (c) => {
		const query = c.req.valid("query");
		const from = query.from ? new Date(query.from) : new Date();
		const until = query.until ? new Date(query.until) : new Date(from.getTime() + 7 * day);
		const episodes = await getAiringSchedule(from, until);
		c.header("Cache-Control", "public, max-age=60");
		return c.json(
			{
				meta: {
					count: episodes.length,
					from: from.toISOString(),
					until: until.toISOString(),
				},
				results: episodes,
			},
			200,
		);
	})

	.openapi(seriesRoute.getCalendar, async (c) => {
		const { time_zone, week } = c.req.valid("query");
		const calendar = await getCalendar(time_zone, week);
		c.header("Cache-Control", "public, max-age=60");
		return c.json(
			{
				meta: {},
				results: calendar,
			},
			200,
		);
	})

	.openapi(seriesRoute.listReleases, async (c) => {
		const { per_page, ...filters } = c.req.valid("query");
		const page = await getLatestReleases({
			...filters,
			perPage: per_page,
		});
		c.header("Cache-Control", "public, max-age=60");
		return c.json(
			{
				meta: pageMeta(c.req.url, page),
				results: page.items,
			},
			200,
		);
	})

	.openapi(seriesRoute.listSeasons, async (c) => {
		const seasons = await listSeasons();
		c.header("Cache-Control", "public, max-age=3600");
		return c.json(
			{
				meta: {
					count: seasons.length,
					current: currentSeason(),
				},
				results: seasons,
			},
			200,
		);
	})

	.openapi(seriesRoute.listUpcoming, async (c) => {
		const titles = await getUpcomingSeries();
		c.header("Cache-Control", "public, max-age=3600");
		return c.json(
			{
				meta: {
					count: titles.length,
				},
				results: titles,
			},
			200,
		);
	});
