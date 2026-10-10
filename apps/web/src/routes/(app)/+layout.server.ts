import { getGenres } from "$routes/(app)/(catalog)/catalog.remote";
import { getContinueWatching } from "$routes/(app)/(home)/home.remote";
import { getWatchlistStatuses } from "$routes/(app)/watchlist/watchlist.remote";
import { redirect } from "@sveltejs/kit";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.viewer) {
		redirect(303, `/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
	}

	if (!locals.viewer.profile) {
		redirect(303, `/profiles?redirect=${encodeURIComponent(url.pathname + url.search)}`);
	}

	await Promise.all([getGenres(), getWatchlistStatuses(), getContinueWatching()]);

	return {
		viewer: {
			profile: locals.viewer.profile,
			profiles: locals.viewer.profiles,
		},
	};
};
