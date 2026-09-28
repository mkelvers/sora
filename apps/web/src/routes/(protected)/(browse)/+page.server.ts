import { sora } from "$lib/server/sora";
import { error } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const { viewer } = locals;
	if (!viewer?.profile) {
		error(403, "Choose a profile first");
	}

	const [airing, trending, recommended] = await Promise.all([
		sora.browse({
			params: {
				status: "RELEASING",
				sort: "popular",
				per_page: 12,
			},
		}),
		sora.browse({
			params: {
				sort: "trending",
				per_page: 20,
			},
		}),
		viewer.sora.recommendations(viewer.profile.id),
	]);

	return {
		featured: airing.filter((card) => card.backdrop_url && card.logo_url).slice(0, 6),
		trending,
		recommended,
	};
};
