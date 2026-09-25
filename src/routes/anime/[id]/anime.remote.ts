import { query } from '$app/server';
import { error } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { z } from 'zod';
import { sora } from '$lib/server/sora';

export const getSeries = query(z.string(), async (id) => {
	try {
		return await sora.series(id);
	} catch (cause) {
		if (cause instanceof SoraError) {
			error(cause.status, cause.message);
		}
		throw cause;
	}
});

export const getEpisodes = query(
	z.object({
		seriesId: z.string(),
		seasonId: z.string()
	}),
	async (season) => {
		return await sora.episodes(season);
	}
);
