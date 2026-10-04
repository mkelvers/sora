import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getContinueWatching = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.request(route.listContinueWatching, {
		params: {
			profile_id: viewer.profile.id,
		},
	});
});

export const dismissContinueWatching = command(z.string(), async (seriesId) => {
	const viewer = remoteViewer();

	await viewer.sora.request(route.dismissContinueWatching, {
		params: {
			profile_id: viewer.profile.id,
			series_id: seriesId,
		},
	});
	await getContinueWatching().refresh();
});
