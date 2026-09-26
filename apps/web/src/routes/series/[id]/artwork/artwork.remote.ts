import { command, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { z } from 'zod';
import { sora } from '$lib/server/sora';
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

		let series;
		try {
			series = await sora.updateArtwork(seriesId, {
				[`${type}_url`]: saved
			});
		} catch (cause) {
			if (cause instanceof SoraError) {
				error(cause.status, cause.message);
			}
			throw cause;
		}

		getSeries(seriesId).set(series);
	}
);
