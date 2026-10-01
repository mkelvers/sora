import { command } from "$app/server";
import { getNotifications, getUnreadNotifications } from "$lib/notifications.remote";
import { remoteViewer } from "$lib/server/sora";
import { getHistory, getShows } from "$lib/shows.remote";
import { getContinueWatching } from "$routes/(protected)/(browse)/home.remote";
import { getSeriesProgress } from "$routes/(protected)/(browse)/series/[id]/series.remote";
import { z } from "zod";

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
			getNotifications().refresh(),
			getUnreadNotifications().refresh(),
		]);
	},
);
