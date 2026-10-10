import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { refreshTracking } from "$routes/(app)/tracking.server";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getSeries = query(z.string(), (id) =>
	remoteViewer().sora.request(route.getSeries, {
		params: {
			series_id: id,
		},
	}),
);

export const getSeriesProgress = query(z.string(), (id) => {
	const { sora, profile } = remoteViewer();

	return sora.request(route.getSeriesProgress, {
		params: {
			profile_id: profile.id,
			series_id: id,
		},
	});
});

export const getEpisodes = query(
	z.object({
		id: z.string(),
		offset: z.number().int().nonnegative(),
		limit: z.number().int().positive(),
	}),
	({ id, offset, limit }) =>
		remoteViewer().sora.request(route.listEpisodes, {
			params: {
				series_id: id,
			},
			query: {
				offset,
				limit,
			},
		}),
);

export const startRewatch = command(z.string(), async (id) => {
	const { sora, profile } = remoteViewer();

	await sora.request(route.startRewatch, {
		params: {
			profile_id: profile.id,
			series_id: id,
		},
	});
	await getSeriesProgress(id).refresh();
});

export const markSeries = command(
	z.object({
		seriesId: z.string(),
		watched: z.boolean(),
	}),
	async ({ seriesId, watched }) => {
		const { sora, profile } = remoteViewer();

		await sora.request(watched ? route.markSeriesWatched : route.removeProgress, {
			params: {
				profile_id: profile.id,
				series_id: seriesId,
			},
		});
		await Promise.all([getSeriesProgress(seriesId).refresh(), refreshTracking()]);
	},
);

export const markEpisode = command(
	z.object({
		seriesId: z.string(),
		episode: z.number().int().positive(),
		watched: z.boolean(),
	}),
	async ({ seriesId, episode, watched }) => {
		const { sora, profile } = remoteViewer();

		await sora.request(watched ? route.markEpisodeWatched : route.markEpisodeUnwatched, {
			params: {
				profile_id: profile.id,
				series_id: seriesId,
				episode,
			},
		});
		await Promise.all([getSeriesProgress(seriesId).refresh(), refreshTracking()]);
	},
);
