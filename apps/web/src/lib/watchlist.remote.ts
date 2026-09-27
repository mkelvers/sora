import { command, getRequestEvent, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

export const getListed = query(async () => {
	const {
		viewer,
	} = getRequestEvent().locals;
	if (!viewer?.profile) {
		error(403, 'Choose a profile first');
	}

	const items = await viewer.sora.watchlist(viewer.profile.id);
	return items.map((item) => item.series.id);
});

export const setListed = command(
	z.object({
		seriesId: z.string(),
		listed: z.boolean(),
	}),
	async ({ seriesId, listed }) => {
		const {
			viewer,
		} = getRequestEvent().locals;
		if (!viewer?.profile) {
			error(403, 'Choose a profile first');
		}

		if (listed) {
			await viewer.sora.addToWatchlist(viewer.profile.id, seriesId);
		} else {
			await viewer.sora.removeFromWatchlist(viewer.profile.id, seriesId);
		}

		await getListed().refresh();
	}
);
