import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import {
	getNotifications,
	getUnreadNotifications,
} from "$routes/(app)/notifications/notifications.remote";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getWatchlist = query(async () => {
	const { sora, profile } = remoteViewer();

	return await sora.request(route.listWatchlist, {
		params: {
			profile_id: profile.id,
		},
	});
});

export const getWatchlistStatuses = query(async () => {
	const { sora, profile } = remoteViewer();

	return await sora.request(route.listWatchlistStatuses, {
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

		await (status
			? sora.request(route.setWatchlistStatus, {
					body: {
						status,
					},
					params,
				})
			: sora.request(route.removeFromWatchlist, {
					params,
				}));

		await Promise.all([
			getWatchlist().refresh(),
			getWatchlistStatuses().refresh(),
			getNotifications().refresh(),
			getUnreadNotifications().refresh(),
		]);
	},
);
