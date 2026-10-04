import { command, query } from "$app/server";
import { remoteViewer, sora } from "$lib/server/sora";
import { getWatchlist } from "$lib/watchlist.remote";
import { getContinueWatching } from "$routes/(app)/(home)/home.remote";
import { z } from "zod";

export const getSeries = query(z.string(), (id) => sora.series(id));

export const getSeriesProgress = query(z.string(), (id) => {
	const viewer = remoteViewer();

	return viewer.sora.seriesProgress(viewer.profile.id, id);
});

export const getEpisodes = query(z.string(), (id) => sora.episodes(id));

export const startRewatch = command(z.string(), async (id) => {
	const viewer = remoteViewer();

	await viewer.sora.startRewatch(viewer.profile.id, id);
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
			await viewer.sora.markSeriesWatched(viewer.profile.id, seriesId);
		} else {
			await viewer.sora.removeProgress(viewer.profile.id, seriesId);
		}

		await Promise.all([
			getSeriesProgress(seriesId).refresh(),
			getContinueWatching().refresh(),
			getWatchlist().refresh(),
		]);
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
		const address = {
			seriesId,
			number: episode,
		};

		if (watched) {
			await viewer.sora.markEpisodeWatched(viewer.profile.id, address);
		} else {
			await viewer.sora.markEpisodeUnwatched(viewer.profile.id, address);
		}

		await Promise.all([
			getSeriesProgress(seriesId).refresh(),
			getContinueWatching().refresh(),
			getWatchlist().refresh(),
		]);
	},
);
