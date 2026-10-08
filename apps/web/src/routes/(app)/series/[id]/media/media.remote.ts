import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { getSeries } from "$routes/(app)/series/[id]/series.remote";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getImages = query(z.string(), (seriesId) =>
	remoteViewer().sora.request(route.listImages, {
		params: {
			series_id: seriesId,
		},
	}),
);

export const refreshImages = command(z.string(), async (seriesId) => {
	getImages(seriesId).set(
		await remoteViewer().sora.request(route.refreshImages, {
			params: {
				series_id: seriesId,
			},
		}),
	);
});

export const setArtwork = command(
	z.object({
		seriesId: z.string(),
		type: z.enum(["poster", "backdrop", "logo"]),
		url: z.union([z.url(), z.literal(false)]),
	}),
	async ({ seriesId, type, url }) => {
		getSeries(seriesId).set(
			await remoteViewer().sora.request(route.updateArtwork, {
				params: {
					series_id: seriesId,
				},
				body: {
					[`${type}_url`]: url,
				},
			}),
		);
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
		getSeries(seriesId).set(
			await remoteViewer().sora.request(route.updateArtwork, {
				params: {
					series_id: seriesId,
				},
				body: {
					logo_scale: scale,
					logo_offset_x: x,
					logo_offset_y: y,
				},
			}),
		);
	},
);
