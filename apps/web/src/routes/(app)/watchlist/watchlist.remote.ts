import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import {
	getNotifications,
	getUnreadNotifications,
} from "$routes/(app)/notifications/notifications.remote";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getWatchlist = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.request(route.listWatchlist, {
		params: {
			profile_id: viewer.profile.id,
		},
	});
});

export const setWatchlistStatus = command(
	z.object({
		seriesId: z.string(),
		status: z.enum(["watching", "plan_to_watch", "completed", "dropped"]).nullable(),
	}),
	async ({ seriesId, status }) => {
		const viewer = remoteViewer();

		if (status) {
			await viewer.sora.request(route.setWatchlistStatus, {
				params: {
					profile_id: viewer.profile.id,
					series_id: seriesId,
				},
				body: {
					status,
				},
			});
		} else {
			await viewer.sora.request(route.removeFromWatchlist, {
				params: {
					profile_id: viewer.profile.id,
					series_id: seriesId,
				},
			});
		}

		await Promise.all([
			getWatchlist().refresh(),
			getNotifications().refresh(),
			getUnreadNotifications().refresh(),
		]);
	},
);
