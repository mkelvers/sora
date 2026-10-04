import { getContinueWatching } from "$routes/(app)/(home)/home.remote";
import {
	getNotifications,
	getUnreadNotifications,
} from "$routes/(app)/notifications/notifications.remote";
import { getWatchlist } from "$routes/(app)/watchlist/watchlist.remote";

export function refreshTracking() {
	return Promise.all([
		getContinueWatching().refresh(),
		getWatchlist().refresh(),
		getNotifications().refresh(),
		getUnreadNotifications().refresh(),
	]);
}
