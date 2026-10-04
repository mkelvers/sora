import { sora } from "$lib/server/sora";
import { route } from "@sora/sdk";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const listing = await sora.requestWithMeta(route.listSeasons);

	return {
		seasons: listing.results,
		current: listing.meta.current,
	};
};
