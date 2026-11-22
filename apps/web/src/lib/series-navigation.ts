import type { FranchisePart } from "@sora/sdk";

type StoryPart = Pick<FranchisePart, "series_id" | "next_series_id" | "episode_count" | "format">;

interface StorySeries {
	id: string;
	episode_count: number;
	seasons: readonly StoryPart[];
	specials: readonly StoryPart[];
}

/**
 * The available direct continuation of this title in its selected adaptation,
 * a season's specials included.
 */
export const storyContinuation = (
	series: Pick<StorySeries, "id" | "seasons" | "specials">,
): StoryPart | undefined => {
	const parts = [...series.seasons, ...series.specials];
	const current = parts.find((part) => part.series_id === series.id);

	if (!current?.next_series_id) {
		return undefined;
	}

	return parts.find((part) => part.series_id === current.next_series_id && part.episode_count > 0);
};

/**
 * Prefer the player's next episode within this title. Only cross into a direct
 * story sequel at the last listed episode, never across a gap or into an extra.
 */
export const nextEpisodeAddress = (
	series: StorySeries,
	episode: number,
	nextWithinTitle: number | null | undefined,
):
	| {
			seriesId: string;
			episode: string;
	  }
	| undefined => {
	if (nextWithinTitle) {
		return {
			episode: String(nextWithinTitle),
			seriesId: series.id,
		};
	}

	if (episode !== series.episode_count) {
		return undefined;
	}

	const next = storyContinuation(series);

	return next
		? {
				episode: "1",
				seriesId: next.series_id,
			}
		: undefined;
};
