import { attempt, minute } from "@sora/shared";
import { sql } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { getAnime, refreshAnime } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import { UnknownAnimeError } from "../../errors";
import { parseInput } from "../payload";
import {
	airingCheckPriority,
	scheduleAiringCheck,
	schedulePoll,
	scheduleRefresh,
	trackAiringTask,
} from "../queue";
import { planNextCheck } from "./airing-plan";
import type { AiringState } from "./airing-plan";
import { Tracked } from "./tracked";

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
export const track: Task = async (rawPayload, helpers) => {
	const payload = parseInput(
		z.object({
			anilistId: z.number().int().positive(),
			attempt: z.number().int().nonnegative(),
			awaitedEpisode: z.number().nullable(),
		}),
		rawPayload,
	);

	const before = await attempt(getAnime(payload.anilistId), UnknownAnimeError);

	if (before.error) {
		helpers.logger.warn(`Anime ${payload.anilistId} is gone from AniList; no longer tracking it`);

		return;
	}

	const anime = await attempt(refreshAnime(payload.anilistId), UnknownAnimeError);

	if (anime.error) {
		helpers.logger.warn(`Anime ${payload.anilistId} is gone from AniList; no longer tracking it`);

		return;
	}

	const tracked = new Tracked(anime.data);
	const episodesBefore = await tracked.aniKoto();
	const releasedBefore = episodesBefore.latest;
	await tracked.refresh(helpers.logger);
	const onAniKoto = await tracked.aniKoto();

	const isChanged =
		onAniKoto.latest !== releasedBefore ||
		JSON.stringify(tracked.layout) !== JSON.stringify(new Tracked(before.data).layout);

	if (isChanged) {
		await scheduleRefresh(anime.data.id);
	}

	let latestAired: AiringState["latestAiredEpisode"] = null;
	let nextAt: Date | null = null;

	// An anime AniKoto does not carry has no episode to wait for; the
	// half-hourly look picks it up once AniKoto adds it.
	if (onAniKoto.carried) {
		latestAired = await tracked.latestAired();
	}

	if (anime.data.nextEpisode) {
		nextAt = new Date(anime.data.nextEpisode.airingAt);
	}

	const plan = planNextCheck(
		{
			latestAiredEpisode: latestAired,
			latestReleasedEpisode: onAniKoto.latest,
			nextAt,
			startDate: anime.data.startDate,
			status: anime.data.status,
		},
		payload,
		new Date(),
	);

	if (plan.done) {
		helpers.logger.info(`Anime ${anime.data.id} has finished airing; no longer tracking it`);

		return;
	}

	// A newly aired episode is watched for on AniKoto from five minutes on,
	// between the tracker's own checks.
	if (plan.awaitedEpisode !== null && plan.attempt === 0) {
		await schedulePoll(
			{
				anilistId: anime.data.id,
				attempt: 0,
				episode: plan.awaitedEpisode,
				language: "sub",
			},
			new Date(Date.now() + 5 * minute),
		);
	}

	await scheduleAiringCheck(
		{
			anilistId: anime.data.id,
			attempt: plan.attempt,
			awaitedEpisode: plan.awaitedEpisode,
		},
		plan.runAt,
	);
};

/** The graphile-worker task that restarts tracking for airing anime that lost their check. */
export const reviveChecksTask = "revive-airing-checks";

/**
 * Restarts tracking for every stored anime that is not finished but has no
 * live check, such as one whose check failed on every retry during a long
 * AniList outage.
 *
 * Runs periodically as a safety net; normally each check schedules the next.
 */
export const reviveChecks: Task = async (_payload, helpers) => {
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
