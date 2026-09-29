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

export const getViewing = query(z.string(), async (seriesId) => {
	const viewer = remoteViewer();

	const [progress, library] = await Promise.all([
		viewer.sora.progress(viewer.profile.id, seriesId),
		viewer.sora.libraryEntry(viewer.profile.id, seriesId),
	]);

	return {
		progress,
		library,
	};
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
		await Promise.all([getViewing(seriesId).refresh(), getListed().refresh()]);
	},
);
