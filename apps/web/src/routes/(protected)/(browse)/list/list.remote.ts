import { command, getRequestEvent, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { getListed } from '$lib/watchlist.remote';

const status = z.enum(['planning', 'watching', 'completed', 'dropped']);

export const getWatchlist = query(status.optional(), async (filter) => {
	const {
		viewer,
	} = getRequestEvent().locals;
	if (!viewer?.profile) {
		error(403, 'Choose a profile first');
	}

	const {
		results,
		meta,
	} = await viewer.sora.watchlist(viewer.profile.id, {
		params: {
			status: filter,
		},
		meta: true,
	});

	return {
		items: results,
		counts: meta.counts,
		preparing: meta.preparing,
	};
});

export const setDropped = command(
	z.object({
		seriesId: z.string(),
		dropped: z.boolean(),
	}),
	async ({ seriesId, dropped }) => {
		const {
			viewer,
		} = getRequestEvent().locals;
		if (!viewer?.profile) {
			error(403, 'Choose a profile first');
		}

		await viewer.sora.setDropped(viewer.profile.id, seriesId, dropped);
	}
);

export const unlist = command(z.string(), async (seriesId) => {
	const {
		viewer,
	} = getRequestEvent().locals;
	if (!viewer?.profile) {
		error(403, 'Choose a profile first');
	}

	await viewer.sora.removeFromWatchlist(viewer.profile.id, seriesId);
	await getListed().refresh();
});
