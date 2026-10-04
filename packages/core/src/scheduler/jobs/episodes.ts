import { attempt } from "@sora/attempt";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { getAnime } from "../../catalog/queries/anime";
import { AnimeNotFoundError } from "../../errors";
import { getProviderUnits } from "../../playback/episodes/episodes";
import { streamProviders } from "../../playback/providers/registry";

const LookUpEpisodesPayloadSchema = z.object({
	anilistId: z.number().int().positive(),
});

/**
 * Looks one AniList entry up on every stream provider and stores their
 * episode lists, which episode listings then read from the database.
 *
 * Providers are asked at once, since each is a different site, and those
 * already looked up are not asked again; the airing tracker and the AniKoto
 * watchers keep the lists current. A failing provider fails the job once
 * the others are stored, so graphile-worker retries it with backoff.
 */
export const lookUpEpisodes: Task = async (rawPayload, helpers) => {
	const { anilistId } = LookUpEpisodesPayloadSchema.parse(rawPayload);

	const { data: anime, error } = await attempt(getAnime(anilistId), AnimeNotFoundError);
	if (error) {
		helpers.logger.warn(`Anime ${anilistId} is gone from AniList; not looking up its episodes`);
		return;
	}

	const failed = (
		await Promise.all(
			streamProviders.map(async (provider) => {
				const { error } = await attempt(getProviderUnits(anime, provider));
				if (error) {
					helpers.logger.warn(
						`Provider ${provider.id} failed for anime ${anilistId}: ${error.message}`,
					);
					return [provider.id];
				}
				return [];
			}),
		)
	).flat();

	if (failed.length > 0) {
		throw new Error(`Looking up anime ${anilistId} failed on ${failed.join(", ")}`);
	}
};
