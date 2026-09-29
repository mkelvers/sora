import { sql } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { z } from "zod";

import type { Anime } from "../../catalog/models/anime";
import { fetchLatestAiring, getAnime, refreshAnime } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import { AnimeNotFoundError } from "../../errors";
import {
	getStoredUnits,
	refreshProviderUnits,
	type StoredUnits,
} from "../../playback/episodes/episodes";
import { streamProviders } from "../../playback/providers/registry";
import { minute } from "../../time";
import {
	airingCheckPriority,
	scheduleAiringCheck,
	scheduleAniKotoPoll,
	scheduleStoredSeriesRefresh,
	trackAiringTask,
} from "../queue";
import { planNextCheck, type AiringState } from "./airing-plan";

const TrackAiringPayloadSchema = z.object({
	anilistId: z.number().int().positive(),
	awaitedEpisode: z.number().nullable(),
	attempt: z.number().int().nonnegative(),
});

/**
 * Follows one anime while it airs.
 *
 * Each run fetches the anime from AniList again, asks every provider for its
 * episode list, and stores both. When either changed what a layout reads,
 * its stored series is queued to be laid out again; most runs, such as the
 * retries while an episode is awaited, change nothing, and a layout costs
 * AniList requests every other job waits on. The next run is scheduled with
 * {@link planNextCheck}. The final run schedules nothing, and the anime is
 * never fetched again.
 *
 * Throwing lets graphile-worker retry the run with backoff, which is how an
 * AniList outage is handled.
 */
export const trackAiring: Task = async (rawPayload, helpers) => {
	const payload = TrackAiringPayloadSchema.parse(rawPayload);

	let before: Anime;
	let anime: Anime;
	try {
		before = await getAnime(payload.anilistId);
		anime = await refreshAnime(payload.anilistId);
	} catch (error) {
		if (error instanceof AnimeNotFoundError) {
			helpers.logger.warn(`Anime ${payload.anilistId} is gone from AniList; no longer tracking it`);
			return;
		}

		throw error;
	}

	const releasedBefore = latestReleased(await getStoredUnits([anime.id]));
	const latestReleasedEpisode = await refreshReleasedEpisodes(anime, helpers.logger);
	if (
		latestReleasedEpisode !== releasedBefore ||
		JSON.stringify(layoutInputs(anime)) !== JSON.stringify(layoutInputs(before))
	) {
		await scheduleStoredSeriesRefresh(anime.id);
	}

	const plan = planNextCheck(
		{
			status: anime.status,
			nextAiringAt: anime.nextEpisode ? new Date(anime.nextEpisode.airingAt) : null,
			latestAiredEpisode: await latestAiredEpisode(anime),
			latestReleasedEpisode,
			startDate: anime.startDate,
		},
		payload,
		new Date(),
	);

	if (plan.done) {
		helpers.logger.info(`Anime ${anime.id} has finished airing; no longer tracking it`);
		return;
	}

	// A newly aired episode is watched for on AniKoto every minute or so,
	// between the tracker's own checks.
	if (plan.awaitedEpisode !== null && plan.attempt === 0) {
		await scheduleAniKotoPoll(
			{
				anilistId: anime.id,
				episode: plan.awaitedEpisode,
				attempt: 0,
			},
			new Date(Date.now() + minute),
		);
	}

	await scheduleAiringCheck(
		{
			anilistId: anime.id,
			awaitedEpisode: plan.awaitedEpisode,
			attempt: plan.attempt,
		},
		plan.runAt,
	);
};

/**
 * What a layout reads of an anime: everything but its score, popularity,
 * tags, and recommendations, which change daily and which cards read from
 * the stored anime itself.
 */
function layoutInputs({
	score: _score,
	popularity: _popularity,
	tags: _tags,
	recommendations: _recommendations,
	...inputs
}: Anime) {
	return inputs;
}

/**
 * The latest episode of the first provider in priority order with any
 * episodes among `stored`, as {@link refreshReleasedEpisodes} returns it.
 */
function latestReleased(stored: readonly StoredUnits[]) {
	for (const provider of streamProviders) {
		const last = stored.find((entry) => entry.provider === provider.id)?.units.at(-1);
		if (last) {
			return last.number;
		}
	}

	return null;
}

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
				retryUnmatched: true,
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

/**
 * The latest episode AniList says has aired, or `null` when unknown or none.
 *
 * Its airing schedule decides when it records the episode: an entry whose
 * broadcast AniList moved can have no next episode announced while the one
 * it moved has not reached providers yet.
 */
async function latestAiredEpisode(anime: Anime): Promise<AiringState["latestAiredEpisode"]> {
	const fromNext =
		anime.nextEpisode && anime.nextEpisode.number > 1 ? anime.nextEpisode.number - 1 : null;
	const fromStatus = anime.status === "FINISHED" ? anime.episodes : null;
	const scheduled = (await fetchLatestAiring(anime.id))?.episode ?? null;
	const known = [fromNext, fromStatus, scheduled].filter((episode) => episode !== null);
	return known.length > 0 ? Math.max(...known) : null;
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
      job_key_mode => 'replace',
      priority => ${airingCheckPriority}::int
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
