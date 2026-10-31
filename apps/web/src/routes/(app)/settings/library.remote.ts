import { command } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { getContinueWatching } from "$routes/(app)/(home)/home.remote";
import { getUnreadNotifications } from "$routes/(app)/notifications/notifications.remote";
import { getWatchlist, getWatchlistStatuses } from "$routes/(app)/watchlist/watchlist.remote";
import { route } from "@sora/sdk";

export const importLibrary = command(
	route.importLibrary.request.body.content["application/json"].schema,
	async (input) => {
		const { sora, profile } = remoteViewer();

		const report = await sora.request(route.importLibrary, {
			body: input,
			params: {
				profile_id: profile.id,
			},
		});
		await Promise.all([
			getWatchlist().refresh(),
			getWatchlistStatuses().refresh(),
			getContinueWatching().refresh(),
			getUnreadNotifications().refresh(),
		]);

		return report;
	},
);
