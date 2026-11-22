import { OpenAPIHono } from "@hono/zod-openapi";
import type { z } from "@hono/zod-openapi";
import { currentSeason, getGenres, listSeasons } from "@sora/core/catalog";
import type { BrowseQuery } from "@sora/core/catalog";
import {
	browseSeries,
	getAiringSchedule,
	getCalendar,
	getLatestReleases,
	getSeries,
	getSeriesEpisode,
	getSeriesEpisodePage,
	getSeriesEpisodes,
	getSimilarSeries,
	getUpcomingSeries,
	getUpscaledBackdrop,
	listSeriesImages,
	listStudios,
	listTags,
	refreshSeriesImages,
	requestBackdropUpscale,
	setSeriesArtwork,
} from "@sora/core/series";
import { day } from "@sora/shared";

import { onInvalidRequest, sendProblem } from "../../errors";
import type { V1Env } from "../../errors";
import { offsetLinks, pageMeta } from "../../openapi/envelope";
import { contract } from "./contract";

/** The browse filters of a `browseSeries` or `searchSeries` query. */
class BrowseFilters {
	readonly #query: z.output<typeof contract.browseSeries.request.query>;

	constructor(query: z.output<typeof contract.browseSeries.request.query>) {
		this.#query = query;
	}

	/** The filters as the core takes them. */
	get query(): BrowseQuery {
		const {
			excluded_tags,
			hide_mature,
			max_episodes,
			min_episodes,
			min_score,
			per_page,
			season_year,
			year_from,
			year_to,
			...filters
		} = this.#query;

		return {
			...filters,
			excludedTags: excluded_tags,
			hideMature: hide_mature,
			maxEpisodes: max_episodes,
			minEpisodes: min_episodes,
			minScore: min_score,
			perPage: per_page,
			seasonYear: season_year,
			yearFrom: year_from,
			yearTo: year_to,
		};
	}
}

/** The handlers for {@link contract}. */
export const handlers = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(contract.browseSeries, async (c) => {
		const page = await browseSeries(new BrowseFilters(c.req.valid("query")).query);
		c.header("Cache-Control", "public, max-age=300");

		return c.json(
			{
				meta: pageMeta(c.req.url, page),
				results: page.items,
			},
			200,
		);
	})

	.openapi(contract.searchSeries, async (c) => {
		const { q, ...filters } = c.req.valid("query");

		const page = await browseSeries({
			...new BrowseFilters(filters).query,
			search: q,
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

	.openapi(contract.getSeries, async (c) => {
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
		let cacheControl = "public, max-age=300";

		if (episodes.some((episode) => episode.audio === null)) {
			cacheControl = "no-store";
		}

		c.header("Cache-Control", cacheControl);

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

	.openapi(contract.listImages, async (c) => {
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

	.openapi(contract.refreshImages, async (c) => {
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

	.openapi(contract.upscaleBackdrop, async (c) => {
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

	.openapi(contract.getBackdrop, async (c) => {
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

	.openapi(contract.updateArtwork, async (c) => {
		const series = await setSeriesArtwork(c.req.valid("param").series_id, c.req.valid("json"));

		return c.json(
			{
				meta: {},
				results: series,
			},
			200,
		);
	})

	.openapi(contract.listEpisodes, async (c) => {
		const { series_id } = c.req.valid("param");
		const { offset = 0, limit } = c.req.valid("query");

		const { episodes, total } = await getSeriesEpisodePage(series_id, {
			limit: limit ?? Number.MAX_SAFE_INTEGER,
			offset,
		});

		const size = limit ?? Math.max(total - offset, 1);
		// Unknown audio is filled in once providers are looked up.
		let cacheControl = "public, max-age=300";

		if (episodes.some((episode) => episode.audio === null)) {
			cacheControl = "no-store";
		}

		c.header("Cache-Control", cacheControl);

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

	.openapi(contract.getEpisode, async (c) => {
		const { series_id, episode } = c.req.valid("param");

		return c.json(
			{
				meta: {},
				results: await getSeriesEpisode(series_id, episode),
			},
			200,
		);
	})

	.openapi(contract.listGenres, async (c) => {
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

	.openapi(contract.listTags, async (c) => {
		const tags = await listTags();
		c.header("Cache-Control", "public, max-age=86400");

		return c.json(
			{
				meta: {
					count: tags.length,
				},
				results: tags,
			},
			200,
		);
	})

	.openapi(contract.listStudios, async (c) => {
		const studios = await listStudios(c.req.valid("query").q);
		c.header("Cache-Control", "public, max-age=3600");

		return c.json(
			{
				meta: {
					count: studios.length,
				},
				results: studios,
			},
			200,
		);
	})

	.openapi(contract.getSchedule, async (c) => {
		const query = c.req.valid("query");
		let from = new Date();

		if (query.from) {
			from = new Date(query.from);
		}

		let until = new Date(from.getTime() + 7 * day);

		if (query.until) {
			until = new Date(query.until);
		}

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

	.openapi(contract.getCalendar, async (c) => {
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

	.openapi(contract.listReleases, async (c) => {
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

	.openapi(contract.listSeasons, async (c) => {
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

	.openapi(contract.listSimilarSeries, async (c) => {
		const titles = await getSimilarSeries(c.req.valid("param").series_id);
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
	})

	.openapi(contract.listUpcoming, async (c) => {
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
