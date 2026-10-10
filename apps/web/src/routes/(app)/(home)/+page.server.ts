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
		viewer.sora.request(route.browseSeries, {
			query: {
				sort: "trending",
				per_page: 20,
			},
		}),
		viewer.sora.request(route.listUpcoming),
		getContinueWatching(),
	]);

	return {
		featured,
		rows: [
			{
				id: "trending",
				title: "Trending Now",
				cards: trending,
			},
			{
				id: "coming-soon",
				title: "Coming Soon: Add to Your Watchlist",
				hint: "Your new favorite shows from the upcoming season",
				cards: upcoming.filter((title) => !title.returning).map((title) => title.series),
			},
			{
				id: "catch-up",
				title: "Catch Up Before the New Season",
				hint: "Catch up on previous episodes before the new season premiere!",
				cards: upcoming.filter((title) => title.returning).map((title) => title.series),
			},
		],
	};
};
