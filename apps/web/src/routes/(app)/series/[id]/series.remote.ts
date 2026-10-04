import { command, query } from "$app/server";
import { remoteViewer, sora } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { z } from "zod";

import { refreshTracking } from "./tracking.server";

export const getSeries = query(z.string(), (id) =>
	sora.request(route.getSeries, {
		params: {
			series_id: id,
		},
	}),
);

export const getSeriesProgress = query(z.string(), (id) => {
	const viewer = remoteViewer();

	return viewer.sora.request(route.getSeriesProgress, {
		params: {
			profile_id: viewer.profile.id,
			series_id: id,
		},
	});
});

export const getEpisodes = query(z.string(), (id) =>
	sora.request(route.listEpisodes, {
		params: {
			series_id: id,
		},
	}),
);

export const startRewatch = command(z.string(), async (id) => {
	const viewer = remoteViewer();

	await viewer.sora.request(route.startRewatch, {
		params: {
			profile_id: viewer.profile.id,
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
		const viewer = remoteViewer();

		if (watched) {
			await viewer.sora.request(route.markSeriesWatched, {
				params: {
					profile_id: viewer.profile.id,
					series_id: seriesId,
				},
			});
		} else {
			await viewer.sora.request(route.removeProgress, {
				params: {
					profile_id: viewer.profile.id,
					series_id: seriesId,
				},
			});
		}

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
		const viewer = remoteViewer();
		const params = {
			profile_id: viewer.profile.id,
			series_id: seriesId,
			episode,
		};

		if (watched) {
			await viewer.sora.request(route.markEpisodeWatched, {
				params,
			});
		} else {
			await viewer.sora.request(route.markEpisodeUnwatched, {
				params,
			});
		}

		await Promise.all([getSeriesProgress(seriesId).refresh(), refreshTracking()]);
	},
);
