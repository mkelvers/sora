import { command, getRequestEvent, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { sora } from '$lib/server/sora';

export const getSeries = query(z.string(), (id) => sora.series(id));

export const getEpisodes = query(
	z.object({
		seriesId: z.string(),
		seasonId: z.string(),
	}),
	(season) => sora.episodes(season)
);

export const getViewing = query(z.string(), async (seriesId) => {
	const {
		viewer,
	} = getRequestEvent().locals;
	if (!viewer?.profile) {
		error(403, 'Choose a profile first');
	}

	const [resume, progress] = await Promise.all([
		viewer.sora.continueWatching(viewer.profile.id, {
			params: {
				series_id: [seriesId],
			},
		}),
		viewer.sora.progress(viewer.profile.id, seriesId)
	]);

	return {
		resume: resume[0] ?? null,
		progress,
	};
});

export const markWatched = command(
	z.object({
		seriesId: z.string(),
		seasonId: z.string(),
		episode: z.number().int().positive(),
		duration: z.number().positive(),
		watched: z.boolean(),
	}),
	async ({ seriesId, seasonId, episode, duration, watched }) => {
		const {
			viewer,
		} = getRequestEvent().locals;
		if (!viewer?.profile) {
			error(403, 'Choose a profile first');
		}

		await viewer.sora.recordProgress(viewer.profile.id, {
			season_id: seasonId,
			episode,
			position_seconds: watched ? duration : 0,
			duration_seconds: duration,
			completed: watched,
		});

		await getViewing(seriesId).refresh();
	}
);
