import { getWatchlist, setWatchlistStatus } from "$lib/watchlist.remote";
import type { SeriesCard, WatchlistStatus } from "@sora/sdk";

export const statusLabels: Record<WatchlistStatus, string> = {
	watching: "Watching",
	plan_to_watch: "Plan to Watch",
	completed: "Completed",
	dropped: "Dropped",
};

export function setStatus(series: SeriesCard, status: WatchlistStatus | null) {
	const now = new Date().toISOString();
	setWatchlistStatus({
		seriesId: series.id,
		status,
	}).updates(
		getWatchlist().withOverride((current) => {
			const rest = current.filter((entry) => entry.series.id !== series.id);
			if (!status) {
				return rest;
			}

			const existing = current.find((entry) => entry.series.id === series.id);
			return [
				{
					series,
					status,
					added_at: existing?.added_at ?? now,
					updated_at: now,
				},
				...rest,
			];
		}),
	);
}
