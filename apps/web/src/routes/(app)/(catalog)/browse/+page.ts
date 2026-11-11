import { getGenres, getTags } from "$routes/(app)/(catalog)/catalog.remote";

import type { PageLoad } from "./$types";

export const load: PageLoad = async () => {
	const [genres, tags] = await Promise.all([getGenres(), getTags()]);
	return {
		genres,
		tags,
	};
};
