import { getGenres } from "$routes/(app)/(catalog)/catalog.remote";
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

	await getGenres();

	return {
		viewer: {
			profile: locals.viewer.profile,
			profiles: locals.viewer.profiles,
		},
	};
};
