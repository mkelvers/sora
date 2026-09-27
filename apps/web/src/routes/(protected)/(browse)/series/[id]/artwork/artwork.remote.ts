import { command, query } from '$app/server';
import { z } from 'zod';
import { sora } from '$lib/server/sora';
import { getSeries } from '../series.remote';

export const getImages = query(z.string(), (seriesId) => sora.images(seriesId));

const savedSizes = {
	poster: 'w780',
	backdrop: 'original',
	logo: 'w500'
} as const;

export const setArtwork = command(
	z.object({
		seriesId: z.string(),
		type: z.enum(['poster', 'backdrop', 'logo']),
		url: z.url().nullable()
	}),
	async ({ seriesId, type, url }) => {
		const series = await sora.updateArtwork(seriesId, {
			[`${type}_url`]: url?.replace('/original/', `/${savedSizes[type]}/`) ?? null
		});

		getSeries(seriesId).set(series);
	}
);
