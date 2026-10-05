import { route } from "@sora/sdk";
import type { AnimeSeason } from "@sora/sdk";
import { error } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

const name = (option: AnimeSeason) =>
	`${option.season.charAt(0)}${option.season.slice(1).toLowerCase()} ${option.year}`;

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.viewer) {
		error(401, "Not signed in");
	}

	const listing = await locals.viewer.sora.requestWithMeta(route.listSeasons);

	const seasons = listing.results.map((option) => ({
		...option,
		label: name(option),
		slug: `${option.season.toLowerCase()}-${option.year}`,
	}));
	const current = seasons.find(
		(option) =>
			option.season === listing.meta.current.season && option.year === listing.meta.current.year,
	);

	return {
		seasons,
		current: current ?? seasons[0],
	};
};
