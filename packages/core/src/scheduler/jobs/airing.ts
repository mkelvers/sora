import { attempt } from "@sora/shared";
import { and, eq, sql } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { z } from "zod";

import type { Anime } from "../../catalog/models/anime";
import { fetchLatestAiring, getAnime, refreshAnime } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import { providerMapping } from "../../database/schema";
import { AnimeNotFoundError } from "../../errors";
import { getStoredUnits, refreshProviderUnits } from "../../playback/episodes/episodes";
import { aniKoto, streamProviders } from "../../playback/providers/registry";
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

	const { data: before, error: missing } = await attempt(
		getAnime(payload.anilistId),
		AnimeNotFoundError,
	);
	if (missing) {
		helpers.logger.warn(`Anime ${payload.anilistId} is gone from AniList; no longer tracking it`);
		return;
	}

	const { data: anime, error: gone } = await attempt(
		refreshAnime(payload.anilistId),
		AnimeNotFoundError,
	);
	if (gone) {
		helpers.logger.warn(`Anime ${payload.anilistId} is gone from AniList; no longer tracking it`);
		return;
	}

	const releasedBefore = (await readAniKotoEpisodes(anime.id)).latest;
	await refreshProviderEpisodes(anime, helpers.logger);
	const onAniKoto = await readAniKotoEpisodes(anime.id);
	if (
		onAniKoto.latest !== releasedBefore ||
		JSON.stringify(layoutInputs(anime)) !== JSON.stringify(layoutInputs(before))
	) {
		await scheduleStoredSeriesRefresh(anime.id);
	}

	const plan = planNextCheck(
		{
			status: anime.status,
			nextAiringAt: anime.nextEpisode ? new Date(anime.nextEpisode.airingAt) : null,
			// An anime AniKoto does not carry has no episode to wait for; the
			// half-hourly look picks it up once AniKoto adds it.
			latestAiredEpisode: onAniKoto.carried ? await latestAiredEpisode(anime) : null,
			latestReleasedEpisode: onAniKoto.latest,
			startDate: anime.startDate,
		},
		payload,
		new Date(),
	);

	if (plan.done) {
		helpers.logger.info(`Anime ${anime.id} has finished airing; no longer tracking it`);
		return;
	}

	// A newly aired episode is watched for on AniKoto from five minutes on,
	// between the tracker's own checks.
	if (plan.awaitedEpisode !== null && plan.attempt === 0) {
		await scheduleAniKotoPoll(
			{
				anilistId: anime.id,
				episode: plan.awaitedEpisode,
				language: "sub",
				attempt: 0,
			},
			new Date(Date.now() + 5 * minute),
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
 * Reads what AniKoto has of an anime from its stored mapping and episode
 * list, without asking AniKoto.
 *
 * Seasons list only the episodes AniKoto carries (see `isEpisodeAvailable`),
 * so its list alone says whether an aired episode is out. Other providers'
 * lists do not count: MegaPlay's are made up from AniList's episode count,
 * and list a whole season before it premieres.
 */
async function readAniKotoEpisodes(anilistId: number) {
	const [[mapping], stored] = await Promise.all([
		db
			.select({
				anikotoId: providerMapping.providerMediaId,
			})
			.from(providerMapping)
			.where(
				and(eq(providerMapping.anilistId, anilistId), eq(providerMapping.provider, aniKoto.id)),
			)
			.limit(1),
		getStoredUnits([anilistId]),
	]);

	return {
		/** Whether AniKoto has the anime in its catalogue, with episodes or not yet. */
		carried: Boolean(mapping?.anikotoId),
		/** The latest episode AniKoto carries, or `null` when it carries none. */
		latest: stored.find((entry) => entry.provider === aniKoto.id)?.units.at(-1)?.number ?? null,
	};
}

/**
 * Re-fetches every provider's episode list and stores it. Every provider is
 * refreshed, not just AniKoto, because playback falls back through all of
 * them. A failing provider is logged and skipped, and keeps its stored list.
 */
async function refreshProviderEpisodes(anime: Anime, logger: Parameters<Task>[1]["logger"]) {
	for (const provider of streamProviders) {
		const { error } = await attempt(
			refreshProviderUnits(anime, provider, {
				retryUnmatched: true,
			}),
		);
		if (error) {
			logger.warn(`Provider ${provider.id} failed for anime ${anime.id}: ${error.message}`);
		}
	}
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
