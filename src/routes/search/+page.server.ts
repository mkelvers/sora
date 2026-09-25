import { error } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { sora } from '$lib/server/sora';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	if (!query) {
		return { query, results: [] };
	}

	try {
		return { query, results: await sora.search(query) };
	} catch (cause) {
		if (cause instanceof SoraError) {
			error(cause.status, cause.message);
		}
		throw cause;
	}
};
