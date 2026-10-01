import { getGenres } from "$lib/catalog.remote";
import { getUnreadNotifications } from "$lib/notifications.remote";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
	if (locals.viewer?.profile) {
		await Promise.all([getUnreadNotifications(), getGenres()]);
	}
};
