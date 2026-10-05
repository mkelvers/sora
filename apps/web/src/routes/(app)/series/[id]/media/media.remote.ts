import { command, query } from "$app/server";
import { remoteViewer, sora } from "$lib/server/sora";
import { getSeries } from "$routes/(app)/series/[id]/series.remote";
import { route, type SeriesImage } from "@sora/sdk";
import { z } from "zod";

const languages = new Intl.DisplayNames(["en"], {
	type: "language",
});

const label = (images: SeriesImage[]) =>
	images.map((image) => ({
		...image,
		label: image.language ? (languages.of(image.language) ?? image.language) : "Textless",
	}));

export const getImages = query(z.string(), async (seriesId) =>
	label(
		await sora.request(route.listImages, {
			params: {
				series_id: seriesId,
			},
		}),
	),
);

export const refreshImages = command(z.string(), async (seriesId) => {
	getImages(seriesId).set(
		label(
			await remoteViewer().sora.request(route.refreshImages, {
				params: {
					series_id: seriesId,
				},
			}),
		),
	);
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
		const series = await remoteViewer().sora.request(route.updateArtwork, {
			params: {
				series_id: seriesId,
			},
			body: {
				[`${type}_url`]: url && url.replace("/original/", `/${savedSizes[type]}/`),
			},
		});

		getSeries(seriesId).set(series);
	},
);

export const setLogoPlacement = command(
	z.object({
		seriesId: z.string(),
		scale: z.number().min(0.5).max(2),
		x: z.number().min(-1).max(1),
		y: z.number().min(-1).max(1),
	}),
	async ({ seriesId, scale, x, y }) => {
		const series = await remoteViewer().sora.request(route.updateArtwork, {
			params: {
				series_id: seriesId,
			},
			body: {
				logo_scale: scale,
				logo_offset_x: x,
				logo_offset_y: y,
			},
		});

		getSeries(seriesId).set(series);
	},
);
