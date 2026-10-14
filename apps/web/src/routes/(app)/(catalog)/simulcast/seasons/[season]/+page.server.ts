import { listSeasons } from "$routes/(app)/(catalog)/simulcast/seasons";
import { error } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.viewer) {
		error(401, "Not signed in");
	}

	const { seasons } = await listSeasons(locals.viewer.sora);
	const selected = seasons.find((option) => option.slug === params.season);
	if (!selected) {
		error(404, "That season is not available");
	}

	return {
		seasons,
		selected,
	};
};
