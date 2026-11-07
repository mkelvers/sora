import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { episodeProgress, seriesState } from "../../database/schema/library";
import { series, seriesEpisode } from "../../database/schema/series";
import { getContinueWatching } from "./progress";

/**
 * Titles from the profile's active viewing, played within 30 days and not
 * completed, that are also on its Continue Watching list. A series with
 * progress that the profile dismissed or has nothing left to play in is left out.
 */
export const getNowWatching = async (profileId: string): Promise<string[]> => {
	const activity = db
		.select({
			seriesId: episodeProgress.seriesId,
			watchedAt: sql<Date>`max(${episodeProgress.watchedAt})`.as("watched_at"),
		})
		.from(episodeProgress)
		.leftJoin(
			seriesState,
			and(
				eq(seriesState.userId, episodeProgress.userId),
				eq(seriesState.seriesId, episodeProgress.seriesId),
			),
		)
		.where(
			and(
				eq(episodeProgress.userId, profileId),
				eq(episodeProgress.rewatch, sql`(${seriesState.rewatchStartedAt} is not null)`),
			),
		)
		.groupBy(episodeProgress.seriesId)
		.as("activity");
	const [rows, continueWatching] = await Promise.all([
		db
			.select({ id: series.id, title: series.title })
			.from(activity)
			.innerJoin(series, eq(series.id, activity.seriesId))
			.leftJoin(
				seriesState,
				and(eq(seriesState.userId, profileId), eq(seriesState.seriesId, series.id)),
			)
			.where(sql`
      ${activity.watchedAt} >= now() - interval '30 days'
      and (${seriesState.status} is distinct from 'completed' or ${seriesState.rewatchStartedAt} is not null)
      and not (
        exists (select 1 from ${seriesEpisode} where ${seriesEpisode.seriesId} = ${series.id})
        and not exists (
          select 1 from ${seriesEpisode}
          where ${seriesEpisode.seriesId} = ${series.id}
          and not exists (
            select 1 from ${episodeProgress}
            where ${episodeProgress.seriesId} = ${series.id}
              and ${episodeProgress.userId} = ${profileId}
              and ${episodeProgress.episode} = ${seriesEpisode.number}
              and ${episodeProgress.rewatch} = (${seriesState.rewatchStartedAt} is not null)
              and ${episodeProgress.finished}
          )
        )
      )
    `)
			.orderBy(desc(activity.watchedAt), series.id),
		getContinueWatching(profileId),
	]);
	const onList = new Set(continueWatching.map((entry) => entry.series.id));
	return rows
		.filter((row) => onList.has(row.id))
		.slice(0, 3)
		.map((row) => row.title);
};
