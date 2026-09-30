import { command, query } from "$app/server";
import { getListed } from "$lib/library.remote";
import { remoteViewer, sora } from "$lib/server/sora";
import { z } from "zod";

export const getSeries = query(z.string(), (id) => sora.series(id));

export const getEpisodes = query(
	z.object({
		seriesId: z.string(),
		seasonId: z.string(),
	}),
	(season) => sora.episodes(season),
);

export const getProgress = query(z.string(), (seriesId) => {
	const viewer = remoteViewer();

	return viewer.sora.progress(viewer.profile.id, seriesId);
});

export const getLibraryStatus = query(z.string(), async (seriesId) => {
	const viewer = remoteViewer();

	return (await viewer.sora.libraryEntry(viewer.profile.id, seriesId)).status;
});

export const setDropped = command(
	z.object({
		seriesId: z.string(),
		dropped: z.boolean(),
	}),
	async ({ seriesId, dropped }) => {
		const viewer = remoteViewer();

		if (dropped) {
			await viewer.sora.dropTitle(viewer.profile.id, seriesId);
		} else {
			await viewer.sora.pickUpTitle(viewer.profile.id, seriesId);
		}
		await Promise.all([getLibraryStatus(seriesId).refresh(), getListed().refresh()]);
	},
);

export const markAllWatched = command(
	z.object({
		seriesId: z.string(),
		seasonId: z.string().optional(),
		episode: z.number().int().positive().optional(),
		watched: z.boolean(),
	}),
	async ({ seriesId, seasonId, episode, watched }) => {
		const viewer = remoteViewer();

		await viewer.sora.markWatched(viewer.profile.id, seriesId, {
			season_id: seasonId,
			episode,
			watched,
		});
		await Promise.all([
			getProgress(seriesId).refresh(),
			getLibraryStatus(seriesId).refresh(),
			getListed().refresh(),
		]);
	},
);
