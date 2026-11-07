import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { episodeProgress, seriesState } from "../../database/schema/library";
import { series, seriesEpisode } from "../../database/schema/series";

/** Titles from the profile's active viewing, played within 30 days and not completed. */
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
	const rows = await db
		.select({ title: series.title })
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
		.orderBy(desc(activity.watchedAt), series.id)
		.limit(3);
	return rows.map((row) => row.title);
};
