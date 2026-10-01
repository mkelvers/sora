import { command, query } from "$app/server";
import { getNotifications, getUnreadNotifications } from "$lib/notifications.remote";
import { remoteViewer, sora } from "$lib/server/sora";
import { getHistory, getShows } from "$lib/shows.remote";
import { getContinueWatching } from "$routes/(protected)/(browse)/home.remote";
import { z } from "zod";

export const getSeries = query(z.string(), (id) => sora.series(id));

export const getSeriesProgress = query(z.string(), (id) => {
	const viewer = remoteViewer();

	return viewer.sora.seriesProgress(viewer.profile.id, id);
});

export const getEpisodes = query(
	z.object({
		seriesId: z.string(),
		seasonId: z.string(),
	}),
	(season) => sora.episodes(season),
);

export const markSeason = command(
	z.object({
		seriesId: z.string(),
		seasonId: z.string(),
		watched: z.boolean(),
	}),
	async ({ seriesId, seasonId, watched }) => {
		const viewer = remoteViewer();

		if (watched) {
			await viewer.sora.markSeason(viewer.profile.id, seasonId);
		} else {
			await viewer.sora.unmarkSeason(viewer.profile.id, seasonId);
		}

		await Promise.all([
			getSeriesProgress(seriesId).refresh(),
			getShows().refresh(),
			getContinueWatching().refresh(),
			getHistory(undefined).refresh(),
			getNotifications().refresh(),
			getUnreadNotifications().refresh(),
		]);
	},
);

export const markEpisode = command(
	z.object({
		seriesId: z.string(),
		seasonId: z.string(),
		episode: z.number().int().positive(),
		watched: z.boolean(),
	}),
	async ({ seriesId, seasonId, episode, watched }) => {
		const viewer = remoteViewer();
		const address = {
			seasonId,
			number: episode,
		};

		if (watched) {
			await viewer.sora.markEpisode(viewer.profile.id, address);
		} else {
			await viewer.sora.unmarkEpisode(viewer.profile.id, address);
		}

		await Promise.all([
			getSeriesProgress(seriesId).refresh(),
			getShows().refresh(),
			getContinueWatching().refresh(),
			getHistory(undefined).refresh(),
			getNotifications().refresh(),
			getUnreadNotifications().refresh(),
		]);
	},
);
