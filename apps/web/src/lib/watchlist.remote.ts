import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { z } from "zod";

export const getWatchlist = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.watchlist(viewer.profile.id);
});

export const setWatchlistStatus = command(
	z.object({
		seriesId: z.string(),
		status: z.enum(["watching", "plan_to_watch", "completed", "dropped"]).nullable(),
	}),
	async ({ seriesId, status }) => {
		const viewer = remoteViewer();

		if (status) {
			await viewer.sora.setWatchlistStatus(viewer.profile.id, seriesId, status);
		} else {
			await viewer.sora.removeFromWatchlist(viewer.profile.id, seriesId);
		}

		await getWatchlist().refresh();
	},
);
