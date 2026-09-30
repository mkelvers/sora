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
		await Promise.all([getProgress(seriesId).refresh(), getListed().refresh()]);
	},
);
