import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { refreshStatus } from "$routes/(app)/tracking.server";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getWatchlist = query(async () => {
	const { sora, profile } = remoteViewer();

	return sora.request(route.listWatchlist, {
		params: {
			profile_id: profile.id,
		},
	});
});

export const setWatchlistStatus = command(
	z.object({
		seriesId: z.string(),
		status: z.enum(["watching", "plan_to_watch", "completed", "dropped"]).nullable(),
	}),
	async ({ seriesId, status }) => {
		const { sora, profile } = remoteViewer();
		const params = {
			profile_id: profile.id,
			series_id: seriesId,
		};

		if (status) {
			await sora.request(route.setWatchlistStatus, {
				params,
				body: {
					status,
				},
			});
		} else {
			await sora.request(route.removeFromWatchlist, {
				params,
			});
		}

		await refreshStatus();
	},
);
