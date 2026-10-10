import { getContinueWatching } from "$routes/(app)/(home)/home.remote";
import {
	getNotifications,
	getUnreadNotifications,
} from "$routes/(app)/notifications/notifications.remote";
import { getWatchlist, getWatchlistStatuses } from "$routes/(app)/watchlist/watchlist.remote";

export function refreshStatus() {
	return Promise.all([
		getWatchlist().refresh(),
		getWatchlistStatuses().refresh(),
		getNotifications().refresh(),
		getUnreadNotifications().refresh(),
	]);
}

export function refreshTracking() {
	return Promise.all([getContinueWatching().refresh(), refreshStatus()]);
}
