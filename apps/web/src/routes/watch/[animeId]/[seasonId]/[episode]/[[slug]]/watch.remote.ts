import { query } from '$app/server';
import { error } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { z } from 'zod';
import { sora } from '$lib/server/sora';

const Params = z.object({
	animeId: z.string(),
	seasonId: z.string(),
	episode: z.coerce.number().int().positive()
});

export const getEpisode = query(Params, async ({ animeId, seasonId, episode }) => {
	try {
		const [series, episodes] = await Promise.all([
			sora.series(animeId),
			sora.episodes({ seriesId: animeId, seasonId })
		]);
		const season = series.seasons.find((season) => season.id === seasonId);
		const found = episodes.find((candidate) => candidate.number === episode);

		if (!season || !found) {
			error(404, 'Episode not found');
		}

		return { series, season, episode: found };
	} catch (cause) {
		if (cause instanceof SoraError) {
			error(cause.status, cause.message);
		}
		throw cause;
	}
});

export const getPlayback = query(Params, async ({ seasonId, episode }) => {
	try {
		return { media: await sora.playback({ seasonId, number: episode }), problem: null };
	} catch (cause) {
		if (cause instanceof SoraError) {
			return { media: [], problem: cause.message };
		}
		throw cause;
	}
});
