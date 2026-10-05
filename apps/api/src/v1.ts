import { OpenAPIHono } from "@hono/zod-openapi";
import {
	auth,
	createProfile,
	deleteProfile,
	getProfile,
	listProfiles,
	updateProfile,
} from "@sora/core/auth";
import { currentSeason, getGenres, listSeasons } from "@sora/core/catalog";
import {
	dismissContinueWatching,
	dismissNotification,
	getContinueWatching,
	getFeatured,
	getNotifications,
	getPlaybackPreferences,
	getProgress,
	getSeriesProgress,
	getWatchlist,
	markNotificationsRead,
	markUnwatched,
	markWatched,
	removeFromWatchlist,
	removeProgress,
	saveProgress,
	setWatchlistStatus,
	startRewatch,
	updatePlaybackPreferences,
} from "@sora/core/library";
import { proxyStream, resolvePlayback } from "@sora/core/playback";
import {
	browseSeries,
	getAdjacentEpisodes,
	getAiringSchedule,
	getLatestReleases,
	getSeries,
	getSeriesEpisodes,
	getUpcomingSeries,
	listSeriesImages,
	refreshSeriesImages,
	setSeriesArtwork,
} from "@sora/core/series";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";

import { onInvalidRequest, sendProblem, type V1Env } from "./errors";
import { pageMeta } from "./openapi/envelope";
import * as route from "./openapi/routes";
import { rateLimit } from "./rate-limit";

const day = 24 * 60 * 60 * 1_000;

/**
 * Version 1 of the API: the handlers for the contracts in `openapi/routes.ts`.
 * Every successful JSON response is `{ meta, results }`: the core's models,
 * in snake_case, under `results`, and facts about the response, such as
 * paging or the IDs it is for, under `meta`.
 *
 * A breaking change to any route belongs in a new version mounted next to
 * this one, never here: deployed clients keep calling `/v1`.
 */
const v1 = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
});

// Browser players (hls.js, subtitle tracks) fetch streams directly.
v1.use(route.getStream.getRoutingPath(), cors());

// Sign-up, sign-in, and sign-out, answered by Better Auth itself.
v1.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

/** Answers 401 unless the request carries a session, as a bearer token or cookie. */
const signedIn = createMiddleware<V1Env>(async (c, next) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});
	if (!session) {
		return sendProblem(c, 401, "UNAUTHORIZED", "Sign in to use this endpoint");
	}

	c.set("accountId", session.user.id);
	c.header("Cache-Control", "private, no-store");
	await next();
});

v1.use("/profiles", signedIn);
v1.use("/profiles/*", signedIn);

// Routes that change what everyone sees or make the server call out to
// providers need an account, and are limited per account so one cannot
// spend the upstream budgets alone.
v1.use(
	route.updateArtwork.getRoutingPath(),
	signedIn,
	rateLimit({
		limit: 30,
		windowMs: 60_000,
	}),
);
v1.use(
	route.refreshImages.getRoutingPath(),
	signedIn,
	rateLimit({
		limit: 6,
		windowMs: 60_000,
	}),
);
v1.use(
	route.getPlayback.getRoutingPath(),
	signedIn,
	rateLimit({
		limit: 60,
		windowMs: 60_000,
	}),
);

v1.openAPIRegistry.registerComponent("securitySchemes", "session", {
	type: "http",
	scheme: "bearer",
	description: "The session token from `POST /v1/auth/sign-in/email`.",
});

/** An episode's playback URL, relative to the API's origin. */
function playbackPath(seriesId: string, episode: number) {
	return `/v1/series/${seriesId}/episodes/${episode}/playback`;
}

export const v1Routes = v1
	.openapi(route.browseSeries, async (c) => {
		const { season_year, per_page, ...filters } = c.req.valid("query");
		const page = await browseSeries({
			...filters,
			seasonYear: season_year,
			perPage: per_page,
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

	.openapi(route.searchSeries, async (c) => {
		const { q, season_year, per_page, ...filters } = c.req.valid("query");
		const page = await browseSeries({
			...filters,
			seasonYear: season_year,
			perPage: per_page,
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

	.openapi(route.getSeries, async (c) => {
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

	.openapi(route.listImages, async (c) => {
		const { type, language, sort } = c.req.valid("query");
		const images = await listSeriesImages(c.req.valid("param").series_id, {
			types: type,
			languages: language,
			sort,
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

	.openapi(route.refreshImages, async (c) => {
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

	.openapi(route.updateArtwork, async (c) => {
		const series = await setSeriesArtwork(c.req.valid("param").series_id, c.req.valid("json"));
		return c.json(
			{
				meta: {},
				results: series,
			},
			200,
		);
	})

	.openapi(route.listEpisodes, async (c) => {
		const { series_id } = c.req.valid("param");
		const episodes = await getSeriesEpisodes(series_id);
		// Unknown audio is filled in once providers are looked up.
		c.header(
			"Cache-Control",
			episodes.some((episode) => episode.audio === null) ? "no-store" : "public, max-age=300",
		);
		return c.json(
			{
				meta: {
					series_id,
					count: episodes.length,
				},
				results: episodes,
			},
			200,
		);
	})

	.openapi(route.listGenres, async (c) => {
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

	.openapi(route.getSchedule, async (c) => {
		const query = c.req.valid("query");
		const from = query.from ? new Date(query.from) : new Date();
		const until = query.until ? new Date(query.until) : new Date(from.getTime() + 7 * day);
		const episodes = await getAiringSchedule(from, until);
		c.header("Cache-Control", "public, max-age=60");
		return c.json(
			{
				meta: {
					from: from.toISOString(),
					until: until.toISOString(),
					count: episodes.length,
				},
				results: episodes,
			},
			200,
		);
	})

	.openapi(route.listReleases, async (c) => {
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

	.openapi(route.listSeasons, async (c) => {
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

	.openapi(route.listUpcoming, async (c) => {
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
	})

	.openapi(route.getPlayback, async (c) => {
		const { series_id, episode } = c.req.valid("param");
		// Absolute, so players on any origin can fetch it.
		const streamBaseUrl = new URL("/v1/streams", c.req.url);
		// Behind a TLS-terminating proxy the API itself is reached over HTTP.
		const protocol = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
		if (protocol === "https" || protocol === "http") {
			streamBaseUrl.protocol = protocol;
		}

		const [playback, adjacent] = await Promise.all([
			resolvePlayback(
				{
					seriesId: series_id,
					episode,
				},
				{
					streamBaseUrl: streamBaseUrl.href,
				},
			),
			getAdjacentEpisodes(series_id, episode),
		]);
		// Stream URLs expire; a cached playback would hand out dead ones.
		c.header("Cache-Control", "no-store");
		return c.json(
			{
				meta: {
					series_id,
					episode,
					expires_at: playback.expiresAt,
					next: adjacent.next === null ? null : playbackPath(series_id, adjacent.next),
					previous: adjacent.previous === null ? null : playbackPath(series_id, adjacent.previous),
				},
				results: playback.media,
			},
			200,
		);
	})

	.openapi(route.getStream, (c) =>
		proxyStream(c.req.valid("param").token, {
			range: c.req.header("range") ?? null,
			signal: c.req.raw.signal,
		}),
	)

	.openapi(route.listProfiles, async (c) => {
		const profiles = await listProfiles(c.get("accountId"));
		return c.json(
			{
				meta: {
					count: profiles.length,
				},
				results: profiles,
			},
			200,
		);
	})

	.openapi(route.createProfile, async (c) => {
		const profile = await createProfile(c.get("accountId"), c.req.valid("json"));
		return c.json(
			{
				meta: {},
				results: profile,
			},
			201,
		);
	})

	.openapi(route.updateProfile, async (c) => {
		const profile = await updateProfile(
			c.get("accountId"),
			c.req.valid("param").profile_id,
			c.req.valid("json"),
		);
		return c.json(
			{
				meta: {},
				results: profile,
			},
			200,
		);
	})

	.openapi(route.deleteProfile, async (c) => {
		await deleteProfile(c.get("accountId"), c.req.valid("param").profile_id);
		return c.body(null, 204);
	})

	.openapi(route.getFeatured, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const titles = await getFeatured(profile.id);
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

	.openapi(route.getPlaybackPreferences, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const preferences = await getPlaybackPreferences(profile.id);
		return c.json(
			{
				meta: {},
				results: preferences,
			},
			200,
		);
	})

	.openapi(route.updatePlaybackPreferences, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const preferences = await updatePlaybackPreferences(profile.id, c.req.valid("json"));
		return c.json(
			{
				meta: {},
				results: preferences,
			},
			200,
		);
	})

	.openapi(route.getProgress, async (c) => {
		const { profile_id, series_id, episode } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		const progress = await getProgress(profile.id, {
			seriesId: series_id,
			episode,
		});
		return c.json(
			{
				meta: {},
				results: progress,
			},
			200,
		);
	})

	.openapi(route.saveProgress, async (c) => {
		const { profile_id, series_id, episode } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		const progress = await saveProgress(
			profile.id,
			{
				seriesId: series_id,
				episode,
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

	.openapi(route.getSeriesProgress, async (c) => {
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

	.openapi(route.removeProgress, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await removeProgress(profile.id, series_id);
		return c.body(null, 204);
	})

	.openapi(route.markSeriesWatched, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await markWatched(profile.id, series_id);
		return c.body(null, 204);
	})

	.openapi(route.markEpisodeWatched, async (c) => {
		const { profile_id, series_id, episode } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await markWatched(profile.id, series_id, episode);
		return c.body(null, 204);
	})

	.openapi(route.markEpisodeUnwatched, async (c) => {
		const { profile_id, series_id, episode } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await markUnwatched(profile.id, {
			seriesId: series_id,
			episode,
		});
		return c.body(null, 204);
	})

	.openapi(route.startRewatch, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await startRewatch(profile.id, series_id);
		return c.body(null, 204);
	})

	.openapi(route.listContinueWatching, async (c) => {
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

	.openapi(route.dismissContinueWatching, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await dismissContinueWatching(profile.id, series_id);
		return c.body(null, 204);
	})

	.openapi(route.listWatchlist, async (c) => {
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

	.openapi(route.setWatchlistStatus, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await setWatchlistStatus(profile.id, series_id, c.req.valid("json").status);
		return c.body(null, 204);
	})

	.openapi(route.removeFromWatchlist, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await removeFromWatchlist(profile.id, series_id);
		return c.body(null, 204);
	})

	.openapi(route.getNotifications, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const notifications = await getNotifications(profile.id, {
			limit: c.req.valid("query").limit,
		});
		return c.json(
			{
				meta: {
					count: notifications.items.length,
					unread: notifications.unread,
				},
				results: notifications.items,
			},
			200,
		);
	})

	.openapi(route.markNotificationsRead, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		await markNotificationsRead(profile.id, c.req.valid("json").ids);
		return c.body(null, 204);
	})

	.openapi(route.dismissNotification, async (c) => {
		const { profile_id, notification_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await dismissNotification(profile.id, notification_id);
		return c.body(null, 204);
	});

v1.doc31("/openapi.json", {
	openapi: "3.1.0",
	info: {
		title: "Sora API",
		version: "1",
		description:
			"Anime titles as AniList lists them: a show's seasons, films, and OVAs are each a title with its own episodes, found from one another as related titles, and addressed by Sora's own IDs. Every field and query parameter is in snake_case. A successful JSON response is `{ meta, results }`: facts about the response under `meta`, such as paging with `next` and `previous` links, and what was asked for under `results`, an object for one resource and an array for a list. Errors are RFC 9457 problems (`application/problem+json`) with a stable `code`.",
	},
	servers: [
		{
			url: "/v1",
		},
	],
});
