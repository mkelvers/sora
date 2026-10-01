import { getGenres } from "$lib/catalog.remote";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
	if (locals.viewer?.profile) {
		await getGenres();
	}
};
