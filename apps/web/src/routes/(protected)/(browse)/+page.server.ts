import { sora } from "$lib/server/sora";
import { error } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const { viewer } = locals;
	if (!viewer?.profile) {
		error(403, "Choose a profile first");
	}

	const [featured, trending, upcoming] = await Promise.all([
		viewer.sora.featured(viewer.profile.id),
		sora.browse({
			params: {
				sort: "trending",
				per_page: 20,
			},
		}),
		sora.upcoming(),
	]);

	return {
		featured,
		trending,
		upcoming,
	};
};
