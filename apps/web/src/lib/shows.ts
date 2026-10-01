import { getShows, setListed } from "$lib/shows.remote";
import type { SeriesCard } from "@sora/sdk";

export function toggleListed(series: SeriesCard, listed: boolean) {
	const add = !listed;
	const added = new Date().toISOString();
	setListed({
		seriesId: series.id,
		listed: add,
	}).updates(
		getShows().withOverride((current) =>
			add
				? [
						{
							series,
							added_at: added,
							active_at: added,
							status: "planned" as const,
							next: null,
							offered: null,
							episode_count: series.episode_count,
							watched_count: 0,
						},
						...current,
					]
				: current.filter((show) => show.series.id !== series.id),
		),
	);
}
