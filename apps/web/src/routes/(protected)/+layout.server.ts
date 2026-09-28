import { redirect } from "@sveltejs/kit";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals, route, url }) => {
	const here = encodeURIComponent(url.pathname + url.search);

	if (!locals.viewer) {
		redirect(303, `/login?redirect=${here}`);
	}

	if (!locals.viewer.profile && !route.id.startsWith("/(protected)/profiles")) {
		redirect(303, `/profiles?redirect=${here}`);
	}

	return {
		viewer: {
			profile: locals.viewer.profile,
			profiles: locals.viewer.profiles,
		},
	};
};
