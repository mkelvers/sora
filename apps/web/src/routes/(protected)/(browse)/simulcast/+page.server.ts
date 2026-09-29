import { sora } from "$lib/server/sora";
import { error } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
	const { results: seasons, meta } = await sora.seasons({
		meta: true,
	});

	const season = url.searchParams.get("season")?.toUpperCase();
	const year = Number(url.searchParams.get("year"));
	const selected =
		season === undefined && !url.searchParams.has("year")
			? meta.current
			: seasons.find((option) => option.season === season && option.year === year);
	if (!selected) {
		error(404, "That simulcast season is not available");
	}

	return {
		seasons,
		current: meta.current,
		selected,
	};
};
