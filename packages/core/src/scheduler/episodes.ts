import type { Task } from "graphile-worker";
import { z } from "zod";

import { getAnime } from "../catalog/queries/anime";
import { AnimeNotFoundError } from "../errors";
import { getProviderUnits } from "../playback/episodes/episodes";
import { streamProviders } from "../playback/providers/registry";

const LookUpEpisodesPayloadSchema = z.object({
  anilistId: z.number().int().positive()
});

/**
 * Looks one AniList entry up on every stream provider and stores their
 * episode lists, which episode listings then read from the database.
 *
 * Providers already looked up are not asked again; the airing tracker keeps
 * the lists of airing entries current. A failing provider fails the job
 * once the others are stored, so graphile-worker retries it with backoff.
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

  const failed: string[] = [];
  for (const { provider } of streamProviders) {
    try {
      await getProviderUnits(anime, provider);
    } catch (error) {
      helpers.logger.warn(`Provider ${provider.id} failed for anime ${anilistId}: ${String(error)}`);
      failed.push(provider.id);
    }
  }

  if (failed.length > 0) {
    throw new Error(`Looking up anime ${anilistId} failed on ${failed.join(", ")}`);
  }
};
