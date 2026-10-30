import { attempt, inSequence } from "@sora/shared";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import type { Task } from "graphile-worker";

import { db } from "../../database/client";
import { animeSearch } from "../../database/schema/catalog";
import { series, titleArtwork, titleImage } from "../../database/schema/series";
import { minBackdropSize } from "../../library/featured/featured";
import { currentFor, currentThresholds, dateBefore } from "../../library/featured/rotation";
import { listSeriesImages } from "../../series/artwork";
import { isCollage } from "../../series/collage";

/** The graphile-worker task that stores the images of titles the home page may feature. */
export const storeFeaturedImagesTask = "store-featured-images";

/** Titles stored per run; each takes a few TMDB requests. */
const titlesPerRun = 10;

/**
 * Stores the TMDB images of every current, well-liked, popular title that has
 * none stored yet, most popular first, and looks at each of its textless 4K
 * backdrops once to tell collages from single pictures. The home page features a title only when
 * its shown backdrop is among its textless 4K ones, which it can tell only
 * from the stored images. Chooses no backdrop.
 */
export const storeFeaturedImagesJob: Task = async (_payload, helpers) => {
	const rows = await db
		.select({
			id: series.id,
		})
		.from(series)
		.innerJoin(animeSearch, eq(animeSearch.anilistId, series.anilistId))
		.leftJoin(titleArtwork, eq(titleArtwork.key, series.key))
		.where(
			and(
				or(
					sql`${titleArtwork.imagesFetchedAt} is null`,
					sql`exists (
						select 1 from ${titleImage}
						where ${titleImage.key} = ${series.key}
							and ${titleImage.type} = 'backdrop'
							and ${titleImage.language} is null
							and ${titleImage.width} >= ${minBackdropSize.width}
							and ${titleImage.height} >= ${minBackdropSize.height}
							and ${titleImage.isCollage} is null
					)`,
				),
				or(
					eq(animeSearch.status, "RELEASING"),
					gte(animeSearch.startDate, dateBefore(new Date(), currentFor)),
				),
				eq(animeSearch.isAdult, false),
				inArray(animeSearch.format, ["TV", "MOVIE"]),
				inArray(animeSearch.status, ["RELEASING", "FINISHED"]),
				gte(animeSearch.averageScore, currentThresholds.score),
				gte(animeSearch.popularity, currentThresholds.popularity),
			),
		)
		.orderBy(desc(animeSearch.popularity))
		.limit(titlesPerRun);

	await inSequence(rows, async ({ id }) => {
		const { data, error } = await attempt(listSeriesImages(id));
		if (error) {
			helpers.logger.warn(`Storing the images of ${id} failed: ${error.message}`);
			return;
		}

		const clean = data.filter(
			(image) =>
				image.type === "backdrop" &&
				!image.upscaled &&
				image.language === null &&
				image.width >= minBackdropSize.width &&
				image.height >= minBackdropSize.height,
		);
		await inSequence(clean, async (image) => {
			const looked = await attempt(isCollage(image.url));
			if (looked.error) {
				helpers.logger.warn(`Looking at ${image.url} failed: ${looked.error.message}`);
				return;
			}
			await db
				.update(titleImage)
				.set({
					isCollage: looked.data,
				})
				.where(
					and(
						eq(titleImage.type, "backdrop"),
						eq(titleImage.url, image.url),
						sql`${titleImage.key} = (select ${series.key} from ${series} where ${series.id} = ${id})`,
					),
				);
		});
	});
};
