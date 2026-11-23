import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getStars = query(z.string(), async (seriesId) => {
	const { sora, profile } = remoteViewer();

	return await sora.request(route.getRating, {
		params: {
			profile_id: profile.id,
			series_id: seriesId,
		},
	});
});

export const setStars = command(
	z.object({
		rating: z.number().int().min(1).max(5).nullable(),
		seriesId: z.string(),
	}),
	async ({ rating, seriesId }) => {
		const { sora, profile } = remoteViewer();

		const params = {
			profile_id: profile.id,
			series_id: seriesId,
		};

		if (rating) {
			await sora.request(route.setRating, {
				body: {
					rating,
				},
				params,
			});
		}

		if (!rating) {
			await sora.request(route.removeRating, {
				params,
			});
		}

		await getStars(seriesId).refresh();
	},
);
