import { command, getRequestEvent, query } from "$app/server";
import { sora } from "$lib/server/sora";
import { getListed } from "$lib/watchlist.remote";
import { error } from "@sveltejs/kit";
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
	const { viewer } = getRequestEvent().locals;
	if (!viewer?.profile) {
		error(403, "Choose a profile first");
	}

	const [resume, progress, library] = await Promise.all([
		viewer.sora.continueWatching(viewer.profile.id, {
			params: {
				series_id: [seriesId],
			},
		}),
		viewer.sora.progress(viewer.profile.id, seriesId),
		viewer.sora.watchlistEntry(viewer.profile.id, seriesId),
	]);

	return {
		resume: resume[0] ?? null,
		progress,
		library,
	};
});

export const markAllWatched = command(
	z.object({
		seriesId: z.string(),
		watched: z.boolean(),
	}),
	async ({ seriesId, watched }) => {
		const { viewer } = getRequestEvent().locals;
		if (!viewer?.profile) {
			error(403, "Choose a profile first");
		}

		await viewer.sora.markWatched(viewer.profile.id, seriesId, {
			watched,
		});
		await Promise.all([getViewing(seriesId).refresh(), getListed().refresh()]);
	},
);

export const clearProgress = command(z.string(), async (seriesId) => {
	const { viewer } = getRequestEvent().locals;
	if (!viewer?.profile) {
		error(403, "Choose a profile first");
	}

	await viewer.sora.clearProgress(viewer.profile.id, seriesId);
	await getViewing(seriesId).refresh();
});
