import { query } from '$app/server';
import { z } from 'zod';
import { fromSora, sora } from '$lib/server/sora';

export const getSeries = query(z.string(), (id) => fromSora(() => sora.series(id)));

export const getEpisodes = query(
	z.object({
		seriesId: z.string(),
		seasonId: z.string()
	}),
	async (season) => {
		return await sora.episodes(season);
	}
);
