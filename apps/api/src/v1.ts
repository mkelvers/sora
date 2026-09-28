import { OpenAPIHono } from "@hono/zod-openapi";
import {
	auth,
	createProfile,
	deleteProfile,
	getProfile,
	getSession,
	listProfiles,
	updateProfile,
} from "@sora/core/auth";
import { getGenres } from "@sora/core/catalog";
import {
	addToLibrary,
	clearProgress,
	dismissFromContinueWatching,
	forgetEpisode,
	getContinueWatching,
	getHistory,
	getLibrary,
	getLibraryEntry,
	getProgress,
	getRecommendations,
	importAniListList,
	markWatched,
	recordProgress,
	removeFromLibrary,
	setLibraryStatus,
} from "@sora/core/library";
import { proxyStream, resolvePlayback } from "@sora/core/playback";
import {
	browseSeries,
	getAdjacentEpisodes,
	getAiringSchedule,
	getSeason,
	getSeasonEpisodes,
	getSeasonSeriesId,
	getSeries,
	listSeriesImages,
	refreshSeriesImages,
	setSeriesArtwork,
	type EpisodeAddress,
} from "@sora/core/series";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";

import { onInvalidRequest, sendProblem, type V1Env } from "./errors";
import { pageMeta, snakeCased } from "./openapi/envelope";
import * as route from "./openapi/routes";

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
export const v1 = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
});

// Browser players (hls.js, subtitle tracks) fetch streams directly.
v1.use(route.getStream.getRoutingPath(), cors());

// Sign-up, sign-in, and sign-out, answered by Better Auth itself.
v1.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

/** Answers 401 unless the request carries a session, as a bearer token or cookie. */
const signedIn = createMiddleware<V1Env>(async (c, next) => {
	const session = await getSession(c.req.raw.headers);
	if (!session) {
		return sendProblem(c, 401, "UNAUTHORIZED", "Sign in to use this endpoint");
	}

	c.set("accountId", session.user.id);
	c.header("Cache-Control", "private, no-store");
	await next();
});

v1.use("/profiles", signedIn);
v1.use("/profiles/*", signedIn);

v1.openAPIRegistry.registerComponent("securitySchemes", "session", {
	type: "http",
	scheme: "bearer",
	description: "The session token from `POST /v1/auth/sign-in/email`.",
});

/** A playback's URL under its title, relative to the API's origin. */
function playbackPath(seriesId: string, { seasonId, episode }: EpisodeAddress) {
	return `/v1/series/${seriesId}/seasons/${seasonId}/episodes/${episode}/playback`;
}

/** A playback's URL under its season alone, relative to the API's origin. */
function seasonPlaybackPath({ seasonId, episode }: EpisodeAddress) {
	return `/v1/seasons/${seasonId}/episodes/${episode}/playback`;
}

/**
 * Resolves an episode's playback and the episodes either side, as both
 * playback routes answer it; `pathOf` spells the neighbours' URLs in the
 * route's own form.
 */
async function playbackBody(
	requestUrl: string,
	forwardedProto: string | undefined,
	address: {
		seriesId: string;
		seasonId: string;
		episode: number;
	},
	pathOf: (address: EpisodeAddress) => string,
) {
	// Absolute, so players on any origin can fetch it.
	const streamBaseUrl = new URL("/v1/streams", requestUrl);
	// Behind a TLS-terminating proxy the API itself is reached over HTTP.
	const protocol = forwardedProto?.split(",")[0]?.trim();
	if (protocol === "https" || protocol === "http") {
		streamBaseUrl.protocol = protocol;
	}

	const [playback, adjacent] = await Promise.all([
		resolvePlayback(address, {
			streamBaseUrl: streamBaseUrl.href,
		}),
		getAdjacentEpisodes(address.seriesId, address.seasonId, address.episode),
	]);
	return {
		meta: {
			series_id: address.seriesId,
			season_id: address.seasonId,
			episode: address.episode,
			expires_at: playback.expiresAt,
			next: adjacent.next && pathOf(adjacent.next),
			previous: adjacent.previous && pathOf(adjacent.previous),
		},
		results: snakeCased(playback.media),
	};
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
				results: snakeCased(page.items),
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
				results: snakeCased(page.items),
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
					results: snakeCased(series),
				},
				200,
			);
		}

		const seasons = await Promise.all(
			series.seasons.map(async (season) => ({
				...season,
				episodes: await getSeasonEpisodes(series.id, season.id),
			})),
		);
		// Unknown audio is filled in once providers are looked up.
		const isAudioPending = seasons.some((season) =>
			season.episodes.some((episode) => episode.audio === null),
		);
		c.header("Cache-Control", isAudioPending ? "no-store" : "public, max-age=300");
		return c.json(
			{
				meta: {},
				results: snakeCased({
					...series,
					seasons,
				}),
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
				results: snakeCased(images),
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
				results: snakeCased(images),
			},
			200,
		);
	})

	.openapi(route.updateArtwork, async (c) => {
		const { poster_url, backdrop_url, logo_url } = c.req.valid("json");
		const series = await setSeriesArtwork(c.req.valid("param").series_id, {
			posterUrl: poster_url,
			backdropUrl: backdrop_url,
			logoUrl: logo_url,
		});
		return c.json(
			{
				meta: {},
				results: snakeCased(series),
			},
			200,
		);
	})

	.openapi(route.getSeason, async (c) => {
		const { series_id, season_id } = c.req.valid("param");
		const season = await getSeason(series_id, season_id);
		c.header("Cache-Control", "public, max-age=300");
		return c.json(
			{
				meta: {
					series_id,
				},
				results: snakeCased(season),
			},
			200,
		);
	})

	.openapi(route.listSeasonEpisodes, async (c) => {
		const { series_id, season_id } = c.req.valid("param");
		const episodes = await getSeasonEpisodes(series_id, season_id);
		// Unknown audio is filled in once providers are looked up.
		c.header(
			"Cache-Control",
			episodes.some((episode) => episode.audio === null) ? "no-store" : "public, max-age=300",
		);
		return c.json(
			{
				meta: {
					series_id,
					season_id,
					count: episodes.length,
				},
				results: snakeCased(episodes),
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
				results: snakeCased(episodes),
			},
			200,
		);
	})

	.openapi(route.getPlayback, async (c) => {
		const { series_id, season_id, episode } = c.req.valid("param");
		const body = await playbackBody(
			c.req.url,
			c.req.header("x-forwarded-proto"),
			{
				seriesId: series_id,
				seasonId: season_id,
				episode,
			},
			(address) => playbackPath(series_id, address),
		);
		// Stream URLs expire; a cached playback would hand out dead ones.
		c.header("Cache-Control", "no-store");
		return c.json(body, 200);
	})

	.openapi(route.getEpisodePlayback, async (c) => {
		const { season_id, episode } = c.req.valid("param");
		const body = await playbackBody(
			c.req.url,
			c.req.header("x-forwarded-proto"),
			{
				seriesId: await getSeasonSeriesId(season_id),
				seasonId: season_id,
				episode,
			},
			seasonPlaybackPath,
		);
		// Stream URLs expire; a cached playback would hand out dead ones.
		c.header("Cache-Control", "no-store");
		return c.json(body, 200);
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
				results: snakeCased(profiles),
			},
			200,
		);
	})

	.openapi(route.createProfile, async (c) => {
		const profile = await createProfile(c.get("accountId"), c.req.valid("json"));
		return c.json(
			{
				meta: {},
				results: snakeCased(profile),
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
				results: snakeCased(profile),
			},
			200,
		);
	})

	.openapi(route.deleteProfile, async (c) => {
		await deleteProfile(c.get("accountId"), c.req.valid("param").profile_id);
		return c.body(null, 204);
	})

	.openapi(route.getContinueWatching, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const items = await getContinueWatching(profile.id, {
			seriesIds: c.req.valid("query").series_id,
		});
		return c.json(
			{
				meta: {
					count: items.length,
				},
				results: snakeCased(items),
			},
			200,
		);
	})

	.openapi(route.getRecommendations, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const titles = await getRecommendations(profile.id);
		return c.json(
			{
				meta: {
					count: titles.length,
				},
				results: snakeCased(titles),
			},
			200,
		);
	})

	.openapi(route.getSeriesProgress, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		const progress = await getProgress(profile.id, series_id);
		return c.json(
			{
				meta: {
					series_id,
				},
				results: snakeCased(progress),
			},
			200,
		);
	})

	.openapi(route.recordProgress, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const update = c.req.valid("json");
		await recordProgress(profile.id, {
			seasonId: update.season_id,
			episode: update.episode,
			positionSeconds: update.position_seconds,
			durationSeconds: update.duration_seconds,
			eventAt: update.event_at,
		});
		return c.body(null, 204);
	})

	.openapi(route.dismissContinueWatching, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await dismissFromContinueWatching(profile.id, series_id);
		return c.body(null, 204);
	})

	.openapi(route.markWatched, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		const body = c.req.valid("json");
		await markWatched(
			profile.id,
			{
				seriesId: series_id,
				seasonId: body.season_id,
				episode: body.episode,
			},
			body.watched,
		);
		return c.body(null, 204);
	})

	.openapi(route.clearProgress, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await clearProgress(profile.id, series_id);
		return c.body(null, 204);
	})

	.openapi(route.getLibrary, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const library = await getLibrary(profile.id, {
			status: c.req.valid("query").status,
		});
		return c.json(
			{
				meta: {
					count: library.items.length,
					counts: library.counts,
					preparing: library.preparing,
				},
				results: snakeCased(library.items),
			},
			200,
		);
	})

	.openapi(route.getLibraryEntry, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		const entry = await getLibraryEntry(profile.id, series_id);
		return c.json(
			{
				meta: {},
				results: snakeCased(entry),
			},
			200,
		);
	})

	.openapi(route.addToLibrary, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await addToLibrary(profile.id, series_id);
		return c.body(null, 204);
	})

	.openapi(route.updateLibraryEntry, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await setLibraryStatus(profile.id, series_id, c.req.valid("json").status);
		return c.body(null, 204);
	})

	.openapi(route.removeFromLibrary, async (c) => {
		const { profile_id, series_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await removeFromLibrary(profile.id, series_id);
		return c.body(null, 204);
	})

	.openapi(route.getHistory, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const query = c.req.valid("query");
		const page = await getHistory(profile.id, {
			after: query.after,
			limit: query.limit,
		});
		const next = new URL(c.req.url);
		next.searchParams.set("after", page.next ?? "");
		return c.json(
			{
				meta: {
					count: page.items.length,
					next: page.next === null ? null : `${next.pathname}${next.search}`,
				},
				results: snakeCased(page.items),
			},
			200,
		);
	})

	.openapi(route.forgetEpisode, async (c) => {
		const { profile_id, season_id, episode } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await forgetEpisode(profile.id, season_id, episode);
		return c.body(null, 204);
	})

	.openapi(route.importAniList, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const summary = await importAniListList(profile.id, c.req.valid("json").user_name);
		return c.json(
			{
				meta: {},
				results: snakeCased(summary),
			},
			200,
		);
	});

v1.doc31("/openapi.json", {
	openapi: "3.1.0",
	info: {
		title: "Sora API",
		version: "1",
		description:
			"Anime titles laid out like a streaming service: one title per show with its seasons, OVAs, and related films, addressed by Sora's own IDs. Every field and query parameter is in snake_case. A successful JSON response is `{ meta, results }`: facts about the response under `meta`, such as paging with `next` and `previous` links, and what was asked for under `results`, an object for one resource and an array for a list. Errors are RFC 9457 problems (`application/problem+json`) with a stable `code`.",
	},
	servers: [
		{
			url: "/v1",
		},
	],
});
