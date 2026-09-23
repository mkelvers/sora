import type { BaseProvider, IMediaMetadata } from "anime-sdk";
import { and, eq } from "drizzle-orm";

import type { Anime } from "../../catalog/models/anime";
import { db } from "../../database/client";
import { providerMapping } from "../../database/schema";
import { day } from "../../time";
import { mappingClient } from "../providers/registry";

/** A confirmed match is reused for a month before being re-verified. */
const matchedMappingLifetimeMs = 30 * day;
/** A failed match is retried daily, since providers add titles over time. */
const unmatchedMappingLifetimeMs = day;

/**
 * Resolves the provider's raw media ID for an anime, using the stored mapping
 * when it is still valid. Returns `null` when the provider has no confident
 * match.
 */
export async function getProviderMediaId(anime: Anime, provider: BaseProvider) {
  const [stored] = await db
    .select()
    .from(providerMapping)
    .where(and(eq(providerMapping.anilistId, anime.id), eq(providerMapping.provider, provider.id)))
    .limit(1);

  if (stored) {
    const lifetime = stored.providerMediaId ? matchedMappingLifetimeMs : unmatchedMappingLifetimeMs;
    if (stored.resolvedAt.getTime() + lifetime > Date.now()) {
      return stored.providerMediaId;
    }
  }

  const resolution = await mappingClient.resolveProviderMediaId(toSdkMetadata(anime), provider);
  const values = {
    providerMediaId: resolution?.rawMediaId ?? null,
    matchedTitle: resolution?.matchedTitle ?? null,
    method: resolution?.method ?? null,
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

  return values.providerMediaId;
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
