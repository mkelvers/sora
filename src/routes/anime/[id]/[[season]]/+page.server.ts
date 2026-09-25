import { error } from '@sveltejs/kit';
import { sora } from '$lib/server/sora';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent, isDataRequest }) => {
	const { series } = await parent();
	// `/anime/{id}` shows the first season; `/anime/{id}/{seasonId}` another.
	let season = series.seasons.at(0);
	if (params.season) {
		season = series.seasons.find((other) => other.id === params.season);
		if (!season) {
			error(404, 'Season not found');
		}
	}

	// Only this season's episodes. Switching seasons streams them, so the page
	// changes at once and shows a skeleton until they arrive; a full page load
	// waits for them instead, so it never flashes one.
	const episodes = season
		? sora.episodes({
				seriesId: series.id,
				seasonId: season.id
			})
		: Promise.resolve([]);

	return {
		season: season ?? null,
		episodes: isDataRequest ? episodes : await episodes
	};
};
