import { getGenres } from "$routes/(app)/(catalog)/catalog.remote";
import { getContinueWatching } from "$routes/(app)/(home)/home.remote";
import { getWatchlist } from "$routes/(app)/watchlist/watchlist.remote";
import { redirect } from "@sveltejs/kit";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const here = encodeURIComponent(url.pathname + url.search);

	if (!locals.viewer) {
		redirect(303, `/login?redirect=${here}`);
	}

	if (!locals.viewer.profile) {
		redirect(303, `/profiles?redirect=${here}`);
	}

	await Promise.all([getGenres(), getWatchlist(), getContinueWatching()]);

	return {
		viewer: {
			profile: locals.viewer.profile,
			profiles: locals.viewer.profiles,
		},
	};
};
