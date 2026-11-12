import { setBrowse } from "$routes/(app)/(catalog)/browse/browse.svelte";
import { getGenres } from "$routes/(app)/(catalog)/catalog.remote";
import { redirect } from "@sveltejs/kit";

import type { PageLoad } from "./$types";

export const ssr = false;

export const load: PageLoad = async ({ params }) => {
	const genres = await getGenres();
	const genre = genres.find(
		(name) => name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-") === params.genre,
	);
	setBrowse({
		genres: genre ? [genre] : [],
	});
	redirect(307, "/browse");
};
