import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { z } from "zod";

export const getListed = query(async () => {
	const viewer = remoteViewer();

	const items = await viewer.sora.library(viewer.profile.id);
	return items.map((item) => item.series.id);
});

export const setListed = command(
	z.object({
		seriesId: z.string(),
		listed: z.boolean(),
	}),
	async ({ seriesId, listed }) => {
		const viewer = remoteViewer();

		if (listed) {
			await viewer.sora.addToLibrary(viewer.profile.id, seriesId);
		} else {
			await viewer.sora.removeFromLibrary(viewer.profile.id, seriesId);
		}

		await getListed().refresh();
	},
);
