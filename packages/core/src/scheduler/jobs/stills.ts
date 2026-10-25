import { attempt, day } from "@sora/shared";
import { sql } from "drizzle-orm";
import type { Task } from "graphile-worker";

import { db } from "../../database/client";
import { episodeStill, series, seriesEpisode } from "../../database/schema";
import { UpstreamUnavailableError } from "../../errors";
import { chooseStill, storeStill } from "../../series/stills";

/** The graphile-worker task that chooses the stills of episodes that have none chosen. */
export const chooseEpisodeStillsTask = "choose-episode-stills";

/** Episodes chosen for per run; each takes a TMDB request and a few image downloads. */
const episodesPerRun = 150;

/** Episodes chosen for at once. */
const concurrency = 4;

/** How long after an episode aired TMDB's stills for it still change. */
const stillsSettleAfterDays = 14;

/**
 * Chooses the still (see `chooseStill`) of every TMDB episode a series
 * lists that has none chosen, newest first, and of those that aired lately
 * once a day, since TMDB's voters and uploaders are still at them.
 *
 * Episodes with a choice stored keep it, so a backlog of the catalogue is
 * worked off over days and each episode is looked at once.
 */
export const chooseEpisodeStillsJob: Task = async (_payload, helpers) => {
	const rows = await db.execute<{
		show_id: number;
		season_number: number;
		episode_number: number;
		still_url: string | null;
	}>(sql`
    select
      substring(${series.key} from '[0-9]+$')::int as show_id,
      ${seriesEpisode.tmdbSeasonNumber} as season_number,
      ${seriesEpisode.tmdbEpisodeNumber} as episode_number,
      min(${seriesEpisode.stillUrl}) as still_url
    from ${seriesEpisode}
    inner join ${series} on ${series.id} = ${seriesEpisode.seriesId}
    left join ${episodeStill}
      on ${episodeStill.showId} = substring(${series.key} from '[0-9]+$')::int
      and ${episodeStill.seasonNumber} = ${seriesEpisode.tmdbSeasonNumber}
      and ${episodeStill.episodeNumber} = ${seriesEpisode.tmdbEpisodeNumber}
    where ${series.key} ~ '^tv:[0-9]+$'
      and ${seriesEpisode.tmdbEpisodeNumber} is not null
      and (
        ${episodeStill.showId} is null
        or (
          ${episodeStill.chosenAt} < now() - ${day / 1000} * interval '1 second'
          and ${seriesEpisode.airDate} >= to_char(now() - ${stillsSettleAfterDays} * interval '1 day', 'YYYY-MM-DD')
        )
      )
    group by 1, 2, 3
    order by max(${seriesEpisode.airDate}) desc nulls last
    limit ${episodesPerRun}
  `);

	let chosen = 0;
	let failed = 0;
	const queue = [...rows];
	await Promise.all(
		Array.from(
			{
				length: concurrency,
			},
			async () => {
				for (let row = queue.shift(); row; row = queue.shift()) {
					const defaultPath =
						row.still_url?.replace(/^https:\/\/image\.tmdb\.org\/t\/p\/[^/]+/, "") ?? null;
					const result = await attempt(
						chooseStill(row.show_id, row.season_number, row.episode_number, defaultPath),
						UpstreamUnavailableError,
					);
					if (result.error) {
						failed += 1;
						helpers.logger.warn(
							`Could not choose a still for ${row.show_id} ${row.season_number}x${row.episode_number}: ${result.error.message}`,
						);
						continue;
					}

					await storeStill(row.show_id, row.season_number, row.episode_number, result.data);
					chosen += 1;
				}
			},
		),
	);

	if (chosen + failed > 0) {
		helpers.logger.info(`Chose ${chosen} episode stills; ${failed} failed`);
	}
};
