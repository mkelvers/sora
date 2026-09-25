import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import type { Anime } from "../../catalog/models/anime";
import { db } from "../../database/client";
import { providerEpisodes, providerMapping } from "../../database/schema";
import type { ProviderEpisode, StreamProvider } from "../providers/provider";
import { getProviderMedia } from "./mapping";

/**
 * An episode as a provider lists it, numbered as the anime numbers it: a part
 * the provider files under its prequel counts from 1.
 */
export type ProviderUnit = ProviderEpisode;

/**
 * A stored list that does not match this, such as one stored before a field
 * was added, is fetched again rather than served.
 */
const ProviderUnitsSchema = z.array(
  z.object({
    id: z.string(),
    number: z.number(),
    title: z.string(),
    languages: z.array(z.enum(["sub", "dub", "raw"])).nullable(),
    isFiller: z.boolean().nullable()
  })
);

/**
 * Returns `provider`'s episode units for `anime`.
 *
 * A stored list is served as is: the airing scheduler refreshes the lists of
 * anime that are still airing, and a finished anime's list does not change.
 * An anime the provider does not carry yields an empty list.
 *
 * @throws when the provider itself fails; callers decide whether to fall back.
 */
export async function getProviderUnits(anime: Anime, provider: StreamProvider): Promise<ProviderUnit[]> {
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

/** What is stored about one provider's episodes of one anime. */
export interface StoredUnits {
  anilistId: number;
  provider: string;
  /** The provider's episode list, empty when the provider does not carry the anime. */
  units: ProviderUnit[];
}

/**
 * Reads the stored episode lists of the given anime, without asking any
 * provider. A provider missing for an anime has not been looked up yet, or
 * its stored list is outdated; {@link getProviderUnits} fills it in.
 */
export async function getStoredUnits(anilistIds: readonly number[]): Promise<StoredUnits[]> {
  if (anilistIds.length === 0) {
    return [];
  }

  const ids = [...new Set(anilistIds)];
  const [listed, unmatched] = await Promise.all([
    db.select().from(providerEpisodes).where(inArray(providerEpisodes.anilistId, ids)),
    db
      .select({
        anilistId: providerMapping.anilistId,
        provider: providerMapping.provider
      })
      .from(providerMapping)
      .where(and(inArray(providerMapping.anilistId, ids), isNull(providerMapping.providerMediaId)))
  ]);

  return [
    ...listed.flatMap((row) => {
      const units = ProviderUnitsSchema.safeParse(row.units);
      return units.success
        ? [
            {
              anilistId: row.anilistId,
              provider: row.provider,
              units: units.data
            }
          ]
        : [];
    }),
    ...unmatched.map((row) => ({
      ...row,
      units: []
    }))
  ];
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
  provider: StreamProvider,
  options: {
    retryUnmatched: boolean;
  }
): Promise<ProviderUnit[]> {
  const media = await getProviderMedia(anime, provider, options);
  if (!media) {
    return [];
  }

  const { mediaId, episodeOffset } = media;
  const units: ProviderUnit[] = (await provider.listEpisodes(mediaId))
    // A part filed under its prequel's series keeps only its own episodes,
    // numbered from 1; a later part may follow them in the same series.
    .filter(
      (unit) =>
        episodeOffset === 0 ||
        (unit.number > episodeOffset && (anime.episodes === null || unit.number <= episodeOffset + anime.episodes))
    )
    .map((unit) => ({
      id: unit.id,
      number: unit.number - episodeOffset,
      title: unit.title,
      languages: unit.languages,
      isFiller: unit.isFiller
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
