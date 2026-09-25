import { sora } from '$lib/server/sora';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	if (!query) {
		return {
			query,
			results: []
		};
	}

	return {
		query,
		results: await sora.search(query)
	};
};
