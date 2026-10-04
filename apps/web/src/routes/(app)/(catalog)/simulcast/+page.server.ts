import { sora } from "$lib/server/sora";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const { results: seasons, meta } = await sora.seasons({
		meta: true,
	});

	return {
		seasons,
		current: meta.current,
	};
};
