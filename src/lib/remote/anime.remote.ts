import { command, query } from '$app/server';
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

const ImageType = z.enum(['poster', 'backdrop', 'logo']);

export const getImages = query(
	z.object({
		seriesId: z.string(),
		type: ImageType,
		sort: z.enum(['votes', 'quality'])
	}),
	async ({ seriesId, type, sort }) => {
		return await sora.images(seriesId, {
			params: {
				type: [type],
				sort
			}
		});
	}
);

const savedSizes = {
	poster: 'w780',
	backdrop: 'original',
	logo: 'w500'
} as const;

export const setArtwork = command(
	z.object({
		seriesId: z.string(),
		type: ImageType,
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
