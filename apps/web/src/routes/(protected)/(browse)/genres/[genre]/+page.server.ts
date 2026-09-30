import { sora } from "$lib/server/sora";
import { genreSlug } from "$lib/utils";
import { error } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const genre = (await sora.genres()).find((name) => genreSlug(name) === params.genre);
	if (!genre) {
		error(404, "That genre is not available");
	}

	return {
		genre,
	};
};
