import { getGenres } from "$routes/(app)/(catalog)/catalog.remote";
import { slug } from "$routes/(app)/(catalog)/genres/slug";
import { error } from "@sveltejs/kit";

import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
	const genres = await getGenres();
	const genre = genres.find((name) => slug(name) === params.genre);
	if (!genre) {
		error(404, "That genre is not available");
	}

	return {
		genre,
	};
};
