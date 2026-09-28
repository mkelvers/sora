import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { z } from "zod";

export const getContinueWatching = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.continueWatching(viewer.profile.id);
});

export const dismiss = command(z.string(), async (seriesId) => {
	const viewer = remoteViewer();

	await viewer.sora.dismissContinueWatching(viewer.profile.id, seriesId);
	await getContinueWatching().refresh();
});
