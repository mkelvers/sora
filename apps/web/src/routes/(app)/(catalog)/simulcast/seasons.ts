import { route } from "@sora/sdk";
import type { SoraClient } from "@sora/sdk";

export const available = async (sora: SoraClient) => {
	const listing = await sora.requestWithMeta(route.listSeasons);

	const seasons = listing.results.map((option) => ({
		...option,
		label: `${option.season.charAt(0)}${option.season.slice(1).toLowerCase()} ${option.year}`,
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
