import { getContinueWatching } from "$routes/(app)/(home)/home.remote";
import { getLatest, getUnread } from "$routes/(app)/notifications/notifications.remote";
import { getEntries, getStatuses } from "$routes/(app)/watchlist/watchlist.remote";

export const refreshStatus = () =>
	Promise.all([
		getEntries().refresh(),
		getStatuses().refresh(),
		getLatest().refresh(),
		getUnread().refresh(),
	]);

export const refreshLibrary = () => Promise.all([getContinueWatching().refresh(), refreshStatus()]);
