import { eq } from "drizzle-orm";

import { db } from "../database/client";
import { titleBackdropUpscale } from "../database/schema/series";

/** Where the web app serves an upscaled backdrop; see {@link upscaledBackdropUrl}. */
const upscaledBackdropPath = "/api/backdrops/";

/** The URL a title's backdrop gets once it is upscaled, relative to the web app's origin. */
export const upscaledBackdropUrl = (id: string) => `${upscaledBackdropPath}${id}`;

/** The ID of the upscale a backdrop URL is served from, or `null` for any other URL. */
export const upscaleIdOf = (url: string) =>
	url.startsWith(upscaledBackdropPath) ? url.slice(upscaledBackdropPath.length) : null;

/** An upscaled backdrop's picture, or `null` when there is no such upscale or it is not ready. */
export const getUpscaledBackdrop = async (id: string): Promise<Uint8Array | null> => {
	const [row] = await db
		.select({
			image: titleBackdropUpscale.image,
		})
		.from(titleBackdropUpscale)
		.where(eq(titleBackdropUpscale.id, id))
		.limit(1);

	return row?.image ?? null;
};
