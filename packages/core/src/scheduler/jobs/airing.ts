import { sql } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { z } from "zod";

import type { Anime } from "../../catalog/models/anime";
import { refreshAnime } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import { AnimeNotFoundError } from "../../errors";
import { refreshProviderUnits } from "../../playback/episodes/episodes";
import { streamProviders } from "../../playback/providers/registry";
import { planNextCheck, type AiringState } from "./airing-plan";
import { scheduleAiringCheck, scheduleStoredSeriesRefresh, trackAiringTask } from "../queue";

const TrackAiringPayloadSchema = z.object({
  anilistId: z.number().int().positive(),
  awaitedEpisode: z.number().nullable(),
  attempt: z.number().int().nonnegative()
});

/**
 * Follows one anime while it airs.
 *
 * Each run fetches the anime from AniList again, asks every provider for its
 * episode list, stores both, queues its stored series to be laid out again,
 * and schedules the next run with {@link planNextCheck}. The final run schedules nothing, and the anime is
 * never fetched again.
 *
 * Throwing lets graphile-worker retry the run with backoff, which is how an
 * AniList outage is handled.
 */
export const trackAiring: Task = async (rawPayload, helpers) => {
  const payload = TrackAiringPayloadSchema.parse(rawPayload);

  let anime: Anime;
  try {
    anime = await refreshAnime(payload.anilistId);
  } catch (error) {
    if (error instanceof AnimeNotFoundError) {
      helpers.logger.warn(`Anime ${payload.anilistId} is gone from AniList; no longer tracking it`);
      return;
    }

    throw error;
  }

  await scheduleStoredSeriesRefresh(anime.id);

  const plan = planNextCheck(
    {
      status: anime.status,
      nextAiringAt: anime.nextEpisode ? new Date(anime.nextEpisode.airingAt) : null,
      latestAiredEpisode: latestAiredEpisode(anime),
      latestReleasedEpisode: await refreshReleasedEpisodes(anime, helpers.logger),
      startDate: anime.startDate
    },
    payload,
    new Date()
  );

  if (plan.done) {
    helpers.logger.info(`Anime ${anime.id} has finished airing; no longer tracking it`);
    return;
  }

  await scheduleAiringCheck(
    {
      anilistId: anime.id,
      awaitedEpisode: plan.awaitedEpisode,
      attempt: plan.attempt
    },
    plan.runAt
  );
};

/**
 * Re-fetches every provider's episode list and returns the latest episode of
 * the first provider in priority order with any episodes, the one playback
 * tries first.
 *
 * Every provider is refreshed, not just that one, because playback falls
 * back through all of them. Other providers' lists do not count, since some
 * list episodes before they air. A failing provider is logged and skipped.
 */
async function refreshReleasedEpisodes(anime: Anime, logger: Parameters<Task>[1]["logger"]) {
  let latest: number | null = null;

  for (const provider of streamProviders) {
    try {
      const units = await refreshProviderUnits(anime, provider, {
        retryUnmatched: true
      });
      const last = units.at(-1);
      if (latest === null && last) {
        latest = last.number;
      }
    } catch (error) {
      logger.warn(`Provider ${provider.id} failed for anime ${anime.id}: ${String(error)}`);
    }
  }

  return latest;
}

/** The latest episode AniList says has aired, or `null` when unknown or none. */
function latestAiredEpisode(anime: Anime): AiringState["latestAiredEpisode"] {
  if (anime.status === "FINISHED") {
    return anime.episodes;
  }

  if (anime.nextEpisode && anime.nextEpisode.number > 1) {
    return anime.nextEpisode.number - 1;
  }

  return null;
}

/** The graphile-worker task that restarts tracking for airing anime that lost their check. */
export const reviveAiringChecksTask = "revive-airing-checks";

/**
 * Restarts tracking for every stored anime that is not finished but has no
 * live check, such as one whose check failed on every retry during a long
 * AniList outage.
 *
 * Runs periodically as a safety net; normally each check schedules the next.
 */
export const reviveAiringChecks: Task = async (_payload, helpers) => {
  const revived = await db.execute(sql`
    select graphile_worker.add_job(
      identifier => ${trackAiringTask},
      payload => json_build_object('anilistId', anime.anilist_id, 'awaitedEpisode', null, 'attempt', 0),
      job_key => 'airing:' || anime.anilist_id,
      job_key_mode => 'replace'
    )
    from anime
    where anime.status in ('RELEASING', 'NOT_YET_RELEASED', 'HIATUS')
      and not exists (
        select 1
        from graphile_worker.jobs
        where jobs.key = 'airing:' || anime.anilist_id
          and jobs.attempts < jobs.max_attempts
      )
  `);

  if (revived.length > 0) {
    helpers.logger.info(`Revived airing checks for ${revived.length} anime`);
  }
};
