import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { getContinueWatching } from "$routes/(protected)/(browse)/home.remote";
import { z } from "zod";

export const getShows = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.shows(viewer.profile.id);
});

export const getHistory = query(z.string().optional(), async (after) => {
	const viewer = remoteViewer();

	const { results, meta } = await viewer.sora.history(viewer.profile.id, {
		params: {
			after,
			limit: 48,
		},
		meta: true,
	});

	return {
		items: results,
		next: meta.next && new URL(meta.next, "http://sora").searchParams.get("after"),
	};
});

export const getDropped = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.dropped(viewer.profile.id);
});

export const setDropped = command(
	z.object({
		seriesId: z.string(),
		dropped: z.boolean(),
	}),
	async ({ seriesId, dropped }) => {
		const viewer = remoteViewer();

		if (dropped) {
			await viewer.sora.dropShow(viewer.profile.id, seriesId);
		} else {
			await viewer.sora.undropShow(viewer.profile.id, seriesId);
		}

		await Promise.all([
			getDropped().refresh(),
			getShows().refresh(),
			getContinueWatching().refresh(),
		]);
	},
);

export const setListed = command(
	z.object({
		seriesId: z.string(),
		listed: z.boolean(),
	}),
	async ({ seriesId, listed }) => {
		const viewer = remoteViewer();

		if (listed) {
			await viewer.sora.addShow(viewer.profile.id, seriesId);
		} else {
			await viewer.sora.removeShow(viewer.profile.id, seriesId);
		}

		await Promise.all([getShows().refresh(), getContinueWatching().refresh()]);
	},
);
