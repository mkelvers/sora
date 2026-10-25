import { route } from "@sora/sdk";
import type { AnimeSeason, SoraClient } from "@sora/sdk";

const name = (option: AnimeSeason) =>
	`${option.season.charAt(0)}${option.season.slice(1).toLowerCase()} ${option.year}`;

export const listSeasons = async (sora: SoraClient) => {
	const listing = await sora.requestWithMeta(route.listSeasons);

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
		current: current ?? seasons[0],
		seasons,
	};
};
