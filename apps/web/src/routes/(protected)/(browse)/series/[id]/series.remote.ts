import { command, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { sora } from '$lib/server/sora';

export const getSeries = query(z.string(), (id) => sora.series(id));

export const getEpisodes = query(
	z.object({
		seriesId: z.string(),
		seasonId: z.string()
	}),
	(season) => sora.episodes(season)
);

export const shuffleEpisode = command(z.string(), async (seriesId) => {
	const series = await sora.series(seriesId, { params: { episodes: true } });
	const playable = series.seasons
		.filter((season) => season.in_watch_order)
		.flatMap((season) =>
			season.episodes
				.filter((episode) => !episode.extra && episode.audio?.length !== 0)
				.map((episode) => ({ seasonId: season.id, number: episode.number }))
		);

	if (!playable.length) {
		error(404, 'Nothing to play yet');
	}

	return playable[Math.floor(Math.random() * playable.length)];
});
