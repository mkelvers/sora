import { getGenres } from "$lib/catalog.remote";
import { getListed } from "$lib/library.remote";

import type { LayoutServerLoad } from "./$types";
import { getUnreadNotifications } from "./home.remote";

export const load: LayoutServerLoad = async ({ locals }) => {
	if (locals.viewer?.profile) {
		await Promise.all([getListed(), getUnreadNotifications(), getGenres()]);
	}
};
