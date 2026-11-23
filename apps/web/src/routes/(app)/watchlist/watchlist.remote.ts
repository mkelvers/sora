import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { getLatest, getUnread } from "$routes/(app)/notifications/notifications.remote";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getEntries = query(async () => {
	const { sora, profile } = remoteViewer();

	return await sora.request(route.listWatchlist, {
		params: {
			profile_id: profile.id,
		},
	});
});

export const getStatuses = query(async () => {
	const { sora, profile } = remoteViewer();

	return await sora.request(route.listWatchlistStatuses, {
		params: {
			profile_id: profile.id,
		},
	});
});

export const setStatus = command(
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
				body: {
					status,
				},
				params,
			});
		}

		if (!status) {
			await sora.request(route.removeFromWatchlist, {
				params,
			});
		}

		await Promise.all([
			getEntries().refresh(),
			getStatuses().refresh(),
			getLatest().refresh(),
			getUnread().refresh(),
		]);
	},
);
