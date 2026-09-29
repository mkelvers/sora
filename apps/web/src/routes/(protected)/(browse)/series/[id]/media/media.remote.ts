import { command, query } from "$app/server";
import { sora } from "$lib/server/sora";
import { z } from "zod";

import { getSeries } from "../series.remote";

export const getImages = query(z.string(), (seriesId) => sora.images(seriesId));

export const refreshImages = command(z.string(), async (seriesId) => {
	getImages(seriesId).set(await sora.refreshImages(seriesId));
});

const savedSizes = {
	poster: "w780",
	backdrop: "original",
	logo: "w500",
} as const;

export const setArtwork = command(
	z.object({
		seriesId: z.string(),
		type: z.enum(["poster", "backdrop", "logo"]),
		url: z.union([z.url(), z.literal(false)]),
	}),
	async ({ seriesId, type, url }) => {
		const series = await sora.updateArtwork(seriesId, {
			[`${type}_url`]: url && url.replace("/original/", `/${savedSizes[type]}/`),
		});

		getSeries(seriesId).set(series);
	},
);
