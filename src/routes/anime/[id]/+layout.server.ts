import { error } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { sora } from '$lib/server/sora';
import type { LayoutServerLoad } from './$types';

/** The title, shared by its page and its artwork page; switching seasons doesn't load it again. */
export const load: LayoutServerLoad = async ({ params }) => {
	try {
		return {
			series: await sora.series(params.id)
		};
	} catch (cause) {
		// An unknown ID renders the 404 page, not a 500.
		if (cause instanceof SoraError) {
			error(cause.status, cause.message);
		}
		throw cause;
	}
};
