import { attempt, day, inParallel } from "@sora/shared";
import { sql } from "drizzle-orm";
import type { Task } from "graphile-worker";

import { db } from "../../database/client";
import { episodeStill, series, titleEpisode } from "../../database/schema/series";
import { UpstreamUnavailableError } from "../../errors";
import { stills } from "../../series/stills";

/** The graphile-worker task that chooses the stills of episodes that have none chosen. */
export const chooseFramesTask = "choose-episode-stills";

/**
 * Chooses the still (see `stills.choose`) of every TMDB episode a series
 * lists that has none chosen, newest first, and of those that aired lately
 * once a day, since TMDB's voters and uploaders are still at them.
 *
 * Episodes with a choice stored keep it, so a backlog of the catalogue is
 * worked off over days and each episode is looked at once.
 */
export const chooseFrames: Task = async (_payload, helpers) => {
	/** How long after an episode aired TMDB's stills for it still change. */
	const settleAfterDays = 14;

	/** Episodes chosen for at once. */
	const concurrency = 4;

	/** Episodes chosen for per run; each takes a TMDB request and a few image downloads. */
	const episodesPerRun = 150;

	const rows = await db.execute<{
		show_id: number;
		season_number: number;
		episode_number: number;
		still_url: string | null;
	}>(sql`
    select
      substring(${series.key} from '[0-9]+$')::int as show_id,
      ${titleEpisode.tmdbSeasonNumber} as season_number,
      ${titleEpisode.tmdbEpisodeNumber} as episode_number,
      min(${titleEpisode.stillUrl}) as still_url
    from ${titleEpisode}
    inner join ${series} on ${series.id} = ${titleEpisode.seriesId}
    left join ${episodeStill}
      on ${episodeStill.showId} = substring(${series.key} from '[0-9]+$')::int
      and ${episodeStill.seasonNumber} = ${titleEpisode.tmdbSeasonNumber}
      and ${episodeStill.episodeNumber} = ${titleEpisode.tmdbEpisodeNumber}
    where ${series.key} ~ '^tv:[0-9]+$'
      and ${titleEpisode.tmdbEpisodeNumber} is not null
      and (
        ${episodeStill.showId} is null
        or (
          ${episodeStill.chosenAt} < now() - ${day / 1000} * interval '1 second'
          and ${titleEpisode.airDate} >= to_char(now() - ${settleAfterDays} * interval '1 day', 'YYYY-MM-DD')
        )
      )
    group by 1, 2, 3
    order by max(${titleEpisode.airDate}) desc nulls last
    limit ${episodesPerRun}
  `);

	let chosen = 0;
	let failed = 0;
	await inParallel([...rows], concurrency, async (row) => {
		const defaultPath =
			row.still_url?.replace(/^https:\/\/image\.tmdb\.org\/t\/p\/[^/]+/u, "") ?? null;

		const result = await attempt(
			stills.choose(row.show_id, row.season_number, row.episode_number, defaultPath),
			UpstreamUnavailableError,
		);

		if (result.error) {
			failed += 1;
			helpers.logger.warn(
				`Could not choose a still for ${row.show_id} ${row.season_number}x${row.episode_number}: ${result.error.message}`,
			);

			return;
		}

		await stills.store(row.show_id, row.season_number, row.episode_number, result.data);
		chosen += 1;
	});

	if (chosen + failed > 0) {
		helpers.logger.info(`Chose ${chosen} episode stills; ${failed} failed`);
	}
};
