import type { BaseProvider, ContentLanguage } from "anime-sdk";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Anime } from "../../catalog/models/anime";
import { plainText } from "../../catalog/models/text";
import { getAnime } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import { providerEpisodes } from "../../database/schema";
import { streamProviders } from "../providers/registry";
import { getProviderMediaId } from "./mapping";

/** One playable episode of an anime. */
export interface Episode {
  /** AniList-canonical episode number; may be fractional for recaps such as `12.5`. */
  number: number;
  /** The provider's episode title, or `null` when it only says "Episode N". */
  title: string | null;
  /** Available audio, or `null` when the provider only reveals it at stream time. */
  languages: ContentLanguage[] | null;
}

/** An anime's episode list as reported by one provider. */
export interface EpisodeList {
  anilistId: number;
  /** The provider that supplied the list. */
  provider: string;
  episodes: Episode[];
}

/** A provider's own identifier for one episode, needed to resolve streams. */
export interface ProviderUnit {
  id: string;
  number: number;
  title: string;
  languages: ContentLanguage[] | null;
}

const ProviderUnitsSchema = z.array(
  z.object({
    id: z.string(),
    number: z.number(),
    title: z.string(),
    languages: z.array(z.enum(["sub", "dub", "raw"])).nullable()
  })
);

/**
 * Lists an anime's episodes from the highest-priority provider that has it.
 *
 * Returns an empty list, rather than throwing, when no provider carries the
 * anime; unreleased and unlicensed titles are common and not an error.
 *
 * @throws {@link AnimeNotFoundError} when the anime does not exist.
 */
export async function listEpisodes(anilistId: number): Promise<EpisodeList> {
  const anime = await getAnime(anilistId);

  for (const provider of streamProviders) {
    const units = await getProviderUnits(anime, provider).catch(() => []);
    if (units.length > 0) {
      return {
        anilistId,
        provider: provider.id,
        episodes: units.map((unit) => ({
          number: unit.number,
          title: /^episode\s+\d+(\.\d+)?$/i.test(unit.title.trim()) ? null : plainText(unit.title),
          languages: unit.languages
        }))
      };
    }
  }

  return {
    anilistId,
    provider: "none",
    episodes: []
  };
}

/**
 * Returns `provider`'s episode units for `anime`.
 *
 * A stored list is served as is: the airing scheduler refreshes the lists of
 * anime that are still airing, and a finished anime's list does not change.
 * An anime the provider does not carry yields an empty list.
 *
 * @throws when the provider itself fails; callers decide whether to fall back.
 */
export async function getProviderUnits(anime: Anime, provider: BaseProvider): Promise<ProviderUnit[]> {
  const [stored] = await db
    .select({
      units: providerEpisodes.units
    })
    .from(providerEpisodes)
    .where(and(eq(providerEpisodes.anilistId, anime.id), eq(providerEpisodes.provider, provider.id)))
    .limit(1);

  const units = stored ? ProviderUnitsSchema.safeParse(stored.units) : null;
  if (units?.success) {
    return units.data;
  }

  return refreshProviderUnits(anime, provider, {
    retryUnmatched: false
  });
}

/**
 * Fetches `provider`'s episode units for `anime` and stores them, replacing
 * any stored list.
 *
 * Nothing is stored when the provider does not carry the anime, so a later
 * request asks again once the provider mapping is retried.
 *
 * @param options.retryUnmatched - Search the provider's catalogue again even
 *   if it recently had no match, for anime that may have just premiered.
 * @throws when the provider itself fails.
 */
export async function refreshProviderUnits(
  anime: Anime,
  provider: BaseProvider,
  options: {
    retryUnmatched: boolean;
  }
): Promise<ProviderUnit[]> {
  const mediaId = await getProviderMediaId(anime, provider, options);
  if (!mediaId) {
    return [];
  }

  const units: ProviderUnit[] = (await provider.fetchContentUnits(`${provider.id}:${mediaId}`))
    .map((unit) => ({
      id: unit.id,
      number: unit.number,
      title: unit.title,
      languages: unit.availableLanguages ?? null
    }))
    .sort((left, right) => left.number - right.number);

  const values = {
    units,
    fetchedAt: new Date()
  };
  await db
    .insert(providerEpisodes)
    .values({
      anilistId: anime.id,
      provider: provider.id,
      ...values
    })
    .onConflictDoUpdate({
      target: [
        providerEpisodes.anilistId,
        providerEpisodes.provider
      ],
      set: values
    });

  return units;
}
