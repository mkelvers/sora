import { query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";

export const getWatchlist = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.library(viewer.profile.id);
});
