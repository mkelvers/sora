import { and, eq, isNull } from "drizzle-orm";

import { db } from "../database/client";
import { seriesState } from "../database/schema";

/**
 * Clears some of what a user decided about a series (see `seriesState`),
 * and deletes the row once nothing is left in it.
 */
export async function clearSeriesState(
	userId: string,
	seriesId: string,
	cleared: {
		watchlist?: boolean;
		rewatch?: boolean;
		dismissal?: boolean;
	},
) {
	const ofSeries = and(eq(seriesState.userId, userId), eq(seriesState.seriesId, seriesId));
	await db.transaction(async (tx) => {
		await tx
			.update(seriesState)
			.set({
				...(cleared.watchlist && {
					status: null,
					addedAt: null,
					statusChangedAt: null,
				}),
				...(cleared.rewatch && {
					rewatchStartedAt: null,
				}),
				...(cleared.dismissal && {
					dismissedAt: null,
				}),
			})
			.where(ofSeries);
		await tx
			.delete(seriesState)
			.where(
				and(
					ofSeries,
					isNull(seriesState.status),
					isNull(seriesState.rewatchStartedAt),
					isNull(seriesState.dismissedAt),
				),
			);
	});
}
