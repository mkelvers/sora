import { error, fail } from '@sveltejs/kit';
import { SoraError, type ArtworkChanges } from '@sora/sdk';
import { sora } from '$lib/server/sora';
import type { Actions, PageServerLoad } from './$types';

const artworkFields = ['poster_url', 'backdrop_url', 'logo_url'] as const;

export const load: PageServerLoad = async ({ params, url }) => {
	let series;
	try {
		series = await sora.series(params.id, { params: { episodes: true } });
	} catch (cause) {
		if (cause instanceof SoraError) {
			error(cause.status, cause.message);
		}
		throw cause;
	}

	// `?season=` picks the season to list; without it, the first.
	const seasonId = url.searchParams.get('season');
	const season = seasonId ? series.seasons.find((season) => season.id === seasonId) : series.seasons[0];
	if (seasonId && !season) {
		error(404, 'Season not found');
	}

	return { series, season: season ?? null };
};

export const actions: Actions = {
	/**
	 * Saves the artwork form. Only fields that differ from what the title shows
	 * are sent, so untouched ones keep following TMDB; an emptied field goes
	 * back to Sora's choice.
	 */
	default: async ({ params, request }) => {
		const form = await request.formData();
		try {
			const current = await sora.series(params.id);
			const changes: ArtworkChanges = {};
			for (const field of artworkFields) {
				const value = form.get(field)?.toString().trim() || null;
				if (value !== current[field]) {
					changes[field] = value;
				}
			}

			await sora.updateArtwork(params.id, changes);
		} catch (cause) {
			if (cause instanceof SoraError && cause.status === 422) {
				return fail(422, { error: 'Every image must be an https:// URL.' });
			}
			if (cause instanceof SoraError) {
				error(cause.status, cause.message);
			}
			throw cause;
		}
	}
};
