import type { BaseProvider, ContentLanguage } from "anime-sdk";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { Anime } from "../../catalog/models/anime";
import { plainText } from "../../catalog/models/text";
import { getAnime } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import { providerEpisodes } from "../../database/schema";
import { day, hour } from "../../time";
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
 * Returns `provider`'s episode units for `anime`, from cache when fresh.
 *
 * An anime the provider does not carry yields an empty list.
 *
 * @throws when the provider itself fails; callers decide whether to fall back.
 */
export async function getProviderUnits(anime: Anime, provider: BaseProvider): Promise<ProviderUnit[]> {
  const [cached] = await db
    .select()
    .from(providerEpisodes)
    .where(and(eq(providerEpisodes.anilistId, anime.id), eq(providerEpisodes.provider, provider.id)))
    .limit(1);

  const stored = cached ? ProviderUnitsSchema.safeParse(cached.units) : null;
  if (cached && stored?.success && cached.fetchedAt.getTime() + episodeListLifetimeMs(anime) > Date.now()) {
    return stored.data;
  }

  const mediaId = await getProviderMediaId(anime, provider);
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

/**
 * Airing shows gain episodes weekly and are checked often; finished shows
 * rarely change.
 */
function episodeListLifetimeMs(anime: Anime) {
  switch (anime.status) {
    case "RELEASING":
      return hour / 2;
    case "NOT_YET_RELEASED":
      return 6 * hour;
    default:
      return day;
  }
}
