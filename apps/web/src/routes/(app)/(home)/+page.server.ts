import { route } from "@sora/sdk";
import { error } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";
import { getContinueWatching } from "./home.remote";

export const load: PageServerLoad = async ({ locals }) => {
	const { viewer } = locals;
	if (!viewer?.profile) {
		error(403, "Choose a profile first");
	}

	const [featured, trending, recommended] = await Promise.all([
		viewer.sora.request(route.getFeatured, {
			params: {
				profile_id: viewer.profile.id,
			},
		}),
		viewer.sora.request(route.browseSeries, {
			query: {
				per_page: 20,
				sort: "trending",
			},
		}),
		viewer.sora.request(route.listRecommendations, {
			params: {
				profile_id: viewer.profile.id,
			},
		}),
		getContinueWatching(),
	]);

	return {
		featured,
		rows: [
			{
				cards: trending,
				id: "trending",
				title: "Trending Now",
			},
			...recommended.map((row) => ({
				cards: row.series,
				id: row.id,
				title: row.title,
			})),
		],
	};
};
