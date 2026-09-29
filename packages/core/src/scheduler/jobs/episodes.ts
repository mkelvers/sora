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

	let anime;
	try {
		anime = await getAnime(anilistId);
	} catch (error) {
		if (error instanceof AnimeNotFoundError) {
			helpers.logger.warn(`Anime ${anilistId} is gone from AniList; not looking up its episodes`);
			return;
		}

		throw error;
	}

	const failed = (
		await Promise.all(
			streamProviders.map(async (provider) => {
				try {
					await getProviderUnits(anime, provider);
					return [];
				} catch (error) {
					helpers.logger.warn(
						`Provider ${provider.id} failed for anime ${anilistId}: ${String(error)}`,
					);
					return [provider.id];
				}
			}),
		)
	).flat();

	if (failed.length > 0) {
		throw new Error(`Looking up anime ${anilistId} failed on ${failed.join(", ")}`);
	}
};
