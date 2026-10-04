import { sora } from "$lib/server/sora";
import { slug } from "$routes/(app)/(catalog)/genres/slug";
import { route } from "@sora/sdk";
import { error } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ params }) => {
	const genres = await sora.request(route.listGenres);

	const genre = genres.find((name) => slug(name) === params.genre);

	if (!genre) {
		error(404, "That genre is not available");
	}

	return {
		genre,
	};
};
