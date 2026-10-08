import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getContinueWatching = query(async () => {
	const { sora, profile } = remoteViewer();

	return sora.request(route.listContinueWatching, {
		params: {
			profile_id: profile.id,
		},
	});
});

export const dismissContinueWatching = command(z.string(), async (seriesId) => {
	const { sora, profile } = remoteViewer();

	await sora.request(route.dismissContinueWatching, {
		params: {
			profile_id: profile.id,
			series_id: seriesId,
		},
	});
	await getContinueWatching().refresh();
});
