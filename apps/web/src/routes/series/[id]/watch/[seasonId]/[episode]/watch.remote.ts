import { query } from '$app/server';
import { error } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { z } from 'zod';
import { fromSora, sora } from '$lib/server/sora';

const Params = z.object({
	seriesId: z.string(),
	seasonId: z.string(),
	episode: z.coerce.number().int().positive()
});

export const getEpisode = query(Params, ({ seriesId, seasonId, episode }) =>
	fromSora(async () => {
		const [series, episodes] = await Promise.all([
			sora.series(seriesId),
			sora.episodes({ seriesId, seasonId })
		]);
		const season = series.seasons.find((season) => season.id === seasonId);
		const found = episodes.find((candidate) => candidate.number === episode);

		if (!season || !found) {
			error(404, 'Episode not found');
		}

		return { series, season, episode: found };
	})
);

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
