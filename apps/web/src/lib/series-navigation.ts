import type { FranchisePart } from "@sora/sdk";

interface StorySeries {
	id: string;
	episode_count: number;
	seasons: readonly Pick<
		FranchisePart,
		"series_id" | "next_series_id" | "episode_count" | "format"
	>[];
}

/** The available direct continuation of this title in its selected adaptation. */
export function storyContinuation(
	series: Pick<StorySeries, "id" | "seasons">,
): StorySeries["seasons"][number] | undefined {
	const current = series.seasons.find((part) => part.series_id === series.id);
	if (!current?.next_series_id) {
		return undefined;
	}
	return series.seasons.find(
		(part) => part.series_id === current.next_series_id && part.episode_count > 0,
	);
}

/**
 * Prefer the player's next episode within this title. Only cross into a direct
 * story sequel at the last listed episode, never across a gap or into an extra.
 */
export function nextEpisodeAddress(
	series: StorySeries,
	episode: number,
	nextWithinTitle: number | null | undefined,
): { seriesId: string; episode: string } | undefined {
	if (nextWithinTitle) {
		return { seriesId: series.id, episode: String(nextWithinTitle) };
	}
	if (episode !== series.episode_count) {
		return undefined;
	}
	const next = storyContinuation(series);
	return next ? { seriesId: next.series_id, episode: "1" } : undefined;
}
