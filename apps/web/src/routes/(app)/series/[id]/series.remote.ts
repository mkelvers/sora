import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { refreshLibrary } from "$routes/(app)/tracking.server";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getDetails = query(z.string(), (id) =>
	remoteViewer().sora.request(route.getSeries, {
		params: {
			series_id: id,
		},
	}),
);

export const getTitleProgress = query(z.string(), (id) => {
	const { sora, profile } = remoteViewer();

	return sora.request(route.getSeriesProgress, {
		params: {
			profile_id: profile.id,
			series_id: id,
		},
	});
});

export const getSimilar = query(z.string(), (id) =>
	remoteViewer().sora.request(route.listSimilarSeries, {
		params: {
			series_id: id,
		},
	}),
);

export const getEpisodes = query(
	z.object({
		backdrop: z.string().nullable(),
		id: z.string(),
		limit: z.number().int().positive(),
		offset: z.number().int().nonnegative(),
	}),
	({ id, offset, limit }) =>
		remoteViewer().sora.request(route.listEpisodes, {
			params: {
				series_id: id,
			},
			query: {
				limit,
				offset,
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
	await getTitleProgress(id).refresh();
});

export const markAll = command(
	z.object({
		seriesId: z.string(),
		watched: z.boolean(),
	}),
	async ({ seriesId, watched }) => {
		const { sora, profile } = remoteViewer();

		const params = {
			profile_id: profile.id,
			series_id: seriesId,
		};

		if (watched) {
			await sora.request(route.markSeriesWatched, {
				params,
			});
		}

		if (!watched) {
			await sora.request(route.removeProgress, {
				params,
			});
		}

		await Promise.all([getTitleProgress(seriesId).refresh(), refreshLibrary()]);
	},
);

export const markEpisode = command(
	z.object({
		episode: z.number().int().positive(),
		seriesId: z.string(),
		watched: z.boolean(),
	}),
	async ({ seriesId, episode, watched }) => {
		const { sora, profile } = remoteViewer();

		const params = {
			episode,
			profile_id: profile.id,
			series_id: seriesId,
		};

		if (watched) {
			await sora.request(route.markEpisodeWatched, {
				params,
			});
		}

		if (!watched) {
			await sora.request(route.markEpisodeUnwatched, {
				params,
			});
		}

		await Promise.all([getTitleProgress(seriesId).refresh(), refreshLibrary()]);
	},
);
