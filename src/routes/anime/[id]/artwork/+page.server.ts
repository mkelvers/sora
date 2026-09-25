import { error, fail } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { sora } from '$lib/server/sora';
import type { Actions, PageServerLoad } from './$types';

/**
 * The TMDB size each kind of artwork is saved in, as Sora picks its own:
 * posters fill at most a column, backdrops the whole window.
 */
const savedSizes = {
	poster_url: 'w780',
	backdrop_url: 'original',
	logo_url: 'w500'
} as const;

type ArtworkField = keyof typeof savedSizes;

export const load: PageServerLoad = async ({ params }) => {
	// Every image at once; the page filters and sorts them itself.
	return {
		images: await sora.images(params.id)
	};
};

export const actions: Actions = {
	/** Makes the clicked image the title's artwork, or goes back to Sora's choice. */
	default: async ({ params, request }) => {
		const form = await request.formData();
		const field = form.get('field') as ArtworkField;
		if (!(field in savedSizes)) {
			return fail(400, {
				field,
				error: 'Unknown kind of artwork.'
			});
		}

		// Reset sends null, which goes back to Sora's choice.
		let url: string | null = null;
		if (!form.has('reset')) {
			const original = String(form.get('url'));
			url = original.replace('/original/', `/${savedSizes[field]}/`);
		}
		try {
			await sora.updateArtwork(params.id, {
				[field]: url
			});
		} catch (cause) {
			if (cause instanceof SoraError && cause.status === 422) {
				return fail(422, {
					field,
					error: 'That image can’t be used.'
				});
			}
			if (cause instanceof SoraError) {
				error(cause.status, cause.message);
			}
			throw cause;
		}

		return {
			field,
			saved: true
		};
	}
};
