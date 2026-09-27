import { getRequestEvent, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

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
