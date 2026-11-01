import { and, eq } from "drizzle-orm";

import { db } from "../../database/client";
import { seriesRating } from "../../database/schema/library";
import type { Rating } from "../../models/library";
import { assertSeriesExists } from "../../series/queries";

/** The stars a user gave a series; `null` rating when they have not rated it. */
export const getRating = async (userId: string, seriesId: string): Promise<Rating> => {
	const [row] = await db
		.select({
			rating: seriesRating.rating,
		})
		.from(seriesRating)
		.where(and(eq(seriesRating.userId, userId), eq(seriesRating.seriesId, seriesId)))
		.limit(1);

	return {
		rating: row?.rating ?? null,
	};
};

/**
 * Rates a series from 1 to 5 stars, replacing an earlier rating.
 *
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 */
export const setRating = async (userId: string, seriesId: string, rating: number) => {
	await assertSeriesExists(seriesId);
	await db
		.insert(seriesRating)
		.values({
			rating,
			seriesId,
			userId,
		})
		.onConflictDoUpdate({
			set: {
				ratedAt: new Date(),
				rating,
			},
			target: [seriesRating.userId, seriesRating.seriesId],
		});
};

/** Takes back a user's rating of a series. */
export const removeRating = async (userId: string, seriesId: string) => {
	await db
		.delete(seriesRating)
		.where(and(eq(seriesRating.userId, userId), eq(seriesRating.seriesId, seriesId)));
};
