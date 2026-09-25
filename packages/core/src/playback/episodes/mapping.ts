import { and, eq } from "drizzle-orm";

import type { Anime } from "../../catalog/models/anime";
import { db } from "../../database/client";
import { providerMapping } from "../../database/schema";
import { day } from "../../time";
import type { StreamProvider } from "../providers/provider";

/** A confirmed match is reused for a month before being re-verified. */
const matchedMappingLifetimeMs = 30 * day;
/** A failed match is retried daily, since providers add titles over time. */
const unmatchedMappingLifetimeMs = day;

/** Where an anime's episodes are in a provider's catalogue. */
export interface ProviderMedia {
  /** The provider's raw media ID. */
  mediaId: string;
  /**
   * Provider episodes that belong to earlier parts: the anime's first
   * episode is the provider's episode `episodeOffset + 1`.
   */
  episodeOffset: number;
}

/**
 * Resolves where an anime is in a provider's catalogue, using the stored
 * mapping when it is still valid. Returns `null` when the provider has no
 * confident match.
 *
 * @param options.retryUnmatched - Search again even if a failed match is
 *   younger than a day, for anime that may have just premiered.
 */
export async function getProviderMedia(
  anime: Anime,
  provider: StreamProvider,
  options: {
    retryUnmatched: boolean;
  }
): Promise<ProviderMedia | null> {
  const [stored] = await db
    .select()
    .from(providerMapping)
    .where(and(eq(providerMapping.anilistId, anime.id), eq(providerMapping.provider, provider.id)))
    .limit(1);

  if (stored && (stored.providerMediaId || !options.retryUnmatched)) {
    const lifetime = stored.providerMediaId ? matchedMappingLifetimeMs : unmatchedMappingLifetimeMs;
    if (stored.resolvedAt.getTime() + lifetime > Date.now()) {
      return toProviderMedia(stored);
    }
  }

  const match = await provider.findMedia(anime);
  const values = {
    providerMediaId: match?.mediaId ?? null,
    matchedTitle: match?.matchedTitle ?? null,
    method: match?.method ?? null,
    episodeOffset: match?.episodeOffset ?? 0,
    resolvedAt: new Date()
  };

  await db
    .insert(providerMapping)
    .values({
      anilistId: anime.id,
      provider: provider.id,
      ...values
    })
    .onConflictDoUpdate({
      target: [
        providerMapping.anilistId,
        providerMapping.provider
      ],
      set: values
    });

  return toProviderMedia(values);
}

function toProviderMedia(mapping: { providerMediaId: string | null; episodeOffset: number }) {
  return mapping.providerMediaId
    ? {
        mediaId: mapping.providerMediaId,
        episodeOffset: mapping.episodeOffset
      }
    : null;
}
