import { command, query } from '$app/server';
import { z } from 'zod';
import { fromSora, sora } from '$lib/server/sora';
import { getSeries } from '../series.remote';

export const getImages = query(z.string(), async (seriesId) => {
	return await sora.images(seriesId);
});

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
		let saved: string | null = null;
		if (url) {
			saved = url.replace('/original/', `/${savedSizes[type]}/`);
		}

		const series = await fromSora(() =>
			sora.updateArtwork(seriesId, {
				[`${type}_url`]: saved
			})
		);

		getSeries(seriesId).set(series);
	}
);
