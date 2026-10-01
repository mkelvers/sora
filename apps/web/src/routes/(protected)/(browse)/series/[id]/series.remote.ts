import { query } from "$app/server";
import { remoteViewer, sora } from "$lib/server/sora";
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
