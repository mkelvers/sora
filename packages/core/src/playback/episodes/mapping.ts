import type { BaseProvider, IMediaMetadata } from "anime-sdk";
import { and, eq } from "drizzle-orm";

import type { Anime } from "../../catalog/models/anime";
import { db } from "../../database/client";
import { providerMapping } from "../../database/schema";
import { day } from "../../time";
import { findAniKotoSeries } from "../providers/anikoto-catalog";
import { aniKotoProvider, mappingClient, providerHttp } from "../providers/registry";

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
  provider: BaseProvider,
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

  const resolution = await resolveMediaId(anime, provider);
  const values = {
    providerMediaId: resolution?.rawMediaId ?? null,
    matchedTitle: resolution?.matchedTitle ?? null,
    method: resolution?.method ?? null,
    episodeOffset: resolution?.episodeOffset ?? 0,
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

/**
 * Matches an anime to a provider's catalogue. AniKoto is matched by ID
 * against its mirrored catalogue; see {@link findAniKotoSeries}. Other
 * providers go through `anime-sdk`'s mapping client.
 */
async function resolveMediaId(anime: Anime, provider: BaseProvider) {
  if (provider.id !== aniKotoProvider.id) {
    const resolution = await mappingClient.resolveProviderMediaId(toSdkMetadata(anime), provider);
    return resolution && {
      ...resolution,
      episodeOffset: 0
    };
  }

  const match = await findAniKotoSeries(providerHttp, anime);
  return match
    ? {
        rawMediaId: match.anikotoId,
        matchedTitle: match.title,
        method: match.method,
        episodeOffset: match.episodeOffset
      }
    : null;
}

/**
 * Describes an anime in the shape `anime-sdk`'s mapping client matches on:
 * titles and synonyms for fuzzy search, year and episode count as
 * discriminators, and AniList/MAL IDs for exact lookups.
 */
function toSdkMetadata(anime: Anime): IMediaMetadata {
  const startYear = anime.startDate ? Number(anime.startDate.slice(0, 4)) : undefined;

  return {
    id: `anilist:${anime.id}`,
    providerId: "anilist",
    catalogType: "ANIME",
    title: {
      romaji: anime.title.romaji ?? undefined,
      english: anime.title.english ?? undefined,
      native: anime.title.native ?? undefined
    },
    synonyms: anime.synonyms,
    year: anime.seasonYear ?? startYear,
    format: anime.format ?? undefined,
    episodeCount: anime.episodes ?? undefined,
    mappings: {
      anilist: anime.id,
      mal: anime.malId ?? undefined
    }
  };
}
