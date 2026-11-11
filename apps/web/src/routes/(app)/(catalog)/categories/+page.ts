import { getGenres, getStudios, getTags } from "$routes/(app)/(catalog)/catalog.remote";

import type { PageLoad } from "./$types";

export const load: PageLoad = async () => {
	const [genres, tags, studios] = await Promise.all([getGenres(), getTags(), getStudios("")]);
	return {
		genres,
		studios,
		tags,
	};
};
