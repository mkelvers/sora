import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { getShows } from "$lib/shows.remote";
import { getContinueWatching } from "$routes/(protected)/(browse)/home.remote";
import { getSeriesProgress } from "$routes/(protected)/(browse)/series/[id]/series.remote";
import { z } from "zod";

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

export const forgetEpisode = command(
	z.object({
		seriesId: z.string(),
		seasonId: z.string(),
		number: z.number().int(),
		pages: z.array(z.string().nullable()),
	}),
	async ({ seriesId, seasonId, number, pages }) => {
		const viewer = remoteViewer();

		await viewer.sora.unmarkEpisode(viewer.profile.id, {
			seasonId,
			number,
		});
		await Promise.all([
			...pages.map((after) => getHistory(after ?? undefined).refresh()),
			getSeriesProgress(seriesId).refresh(),
			getShows().refresh(),
			getContinueWatching().refresh(),
		]);
	},
);
