import { command, query } from "$app/server";
import { getListed } from "$lib/library.remote";
import { remoteViewer } from "$lib/server/sora";
import { getContinueWatching } from "$routes/(protected)/(browse)/home.remote";
import { getProgress } from "$routes/(protected)/(browse)/series/[id]/series.remote";
import { z } from "zod";

export const getWatchlist = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.library(viewer.profile.id);
});

export const getHistory = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.history(viewer.profile.id, {
		params: {
			limit: 48,
		},
	});
});

export const removeFromWatchlist = command(z.string(), async (seriesId) => {
	const viewer = remoteViewer();

	await viewer.sora.removeFromLibrary(viewer.profile.id, seriesId);
	await Promise.all([getWatchlist().refresh(), getListed().refresh()]);
});

export const forgetEpisode = command(
	z.object({
		seriesId: z.string(),
		seasonId: z.string(),
		number: z.number().int(),
	}),
	async ({ seriesId, seasonId, number }) => {
		const viewer = remoteViewer();

		await viewer.sora.forgetEpisode(viewer.profile.id, {
			seasonId,
			number,
		});
		await Promise.all([
			getHistory().refresh(),
			getProgress(seriesId).refresh(),
			getWatchlist().refresh(),
			getContinueWatching().refresh(),
		]);
	},
);
