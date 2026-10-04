import { sora } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { error } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";
import { getContinueWatching } from "./home.remote";

export const load: PageServerLoad = async ({ locals }) => {
	const { viewer } = locals;
	if (!viewer?.profile) {
		error(403, "Choose a profile first");
	}

	const [featured, trending, upcoming] = await Promise.all([
		viewer.sora.request(route.getFeatured, {
			params: {
				profile_id: viewer.profile.id,
			},
		}),
		sora.request(route.browseSeries, {
			query: {
				sort: "trending",
				per_page: 20,
			},
		}),
		sora.request(route.listUpcoming),
		getContinueWatching(),
	]);

	return {
		featured,
		trending,
		upcoming,
	};
};
