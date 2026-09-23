import { eq, inArray } from "drizzle-orm";

import { anilist } from "../../anilist/client";
import { AnimeCardsDocument, AnimeDetailsDocument, type AnimeDetailsFragment } from "../../anilist/graphql.generated";
import { db } from "../../database/client";
import { anime as animeTable } from "../../database/schema";
import { AnimeNotFoundError } from "../../errors";
import { startTrackingAiring } from "../../scheduler/queue";
import { hour } from "../../time";
import { toAnime, toAnimeCard, type Anime, type AnimeCard, type AnimeStatus } from "../models/anime";

/**
 * Loads the full details of one anime.
 *
 * The first request fetches the anime from AniList and stores it for good;
 * every later request is served from the database. An anime that has not
 * finished airing is handed to the airing scheduler, which keeps the stored
 * copy current until its final episode is out.
 *
 * @throws {@link AnimeNotFoundError} when the ID is unknown to AniList, or
 *   belongs to adult media, which the catalog never serves.
 * @throws {@link UpstreamUnavailableError} when the anime is not stored yet
 *   and AniList cannot be reached.
 */
export async function getAnime(anilistId: number): Promise<Anime> {
  const [stored] = await db
    .select({
      media: animeTable.media
    })
    .from(animeTable)
    .where(eq(animeTable.anilistId, anilistId))
    .limit(1);

  if (stored) {
    return toAnime(stored.media);
  }

  const media = await fetchAnimeDetails(anilistId, hour);
  await db
    .insert(animeTable)
    .values(storedAnimeValues(media))
    .onConflictDoNothing();

  if (isStillAiring(media.status)) {
    await startTrackingAiring(anilistId);
  }

  return toAnime(media);
}

/**
 * Fetches an anime from AniList again and overwrites the stored copy.
 *
 * Only the airing scheduler calls this; nothing else updates a stored anime.
 *
 * @throws {@link AnimeNotFoundError} when AniList no longer serves the anime.
 * @throws {@link UpstreamUnavailableError} when AniList cannot be reached.
 */
export async function refreshAnime(anilistId: number): Promise<Anime> {
  const media = await fetchAnimeDetails(anilistId, 0);
  const values = storedAnimeValues(media);
  await db
    .insert(animeTable)
    .values(values)
    .onConflictDoUpdate({
      target: animeTable.anilistId,
      set: {
        media: values.media,
        status: values.status,
        refreshedAt: values.refreshedAt
      }
    });

  return toAnime(media);
}

/**
 * Whether AniList may still add episodes to an anime with this status, so the
 * airing scheduler needs to follow it.
 */
export function isStillAiring(status: AnimeStatus | null) {
  return status === "RELEASING" || status === "NOT_YET_RELEASED" || status === "HIATUS";
}

/**
 * Loads cards for many anime, preserving the order of `ids`.
 *
 * Stored anime are served from the database. The rest are fetched from
 * AniList in one request per 50 IDs and not stored, since a card lacks the
 * details a stored anime needs.
 *
 * Unknown and adult IDs are omitted rather than failing the whole batch,
 * because the IDs usually come from stored user data that may predate a
 * removal on AniList.
 */
export async function getAnimeCards(ids: readonly number[]): Promise<AnimeCard[]> {
  const unique = [...new Set(ids)];
  const byId = new Map<number, AnimeCard>();

  if (unique.length > 0) {
    const stored = await db
      .select({
        media: animeTable.media
      })
      .from(animeTable)
      .where(inArray(animeTable.anilistId, unique));

    for (const row of stored) {
      byId.set(row.media.id, toAnimeCard(row.media));
    }
  }

  const missing = unique.filter((id) => !byId.has(id));

  // AniList pages are capped at 50 entries.
  for (let offset = 0; offset < missing.length; offset += 50) {
    const batch = missing.slice(offset, offset + 50).sort((left, right) => left - right);
    const { Page } = await anilist(
      AnimeCardsDocument,
      {
        ids: batch,
        perPage: batch.length
      },
      {
        maxAgeMs: hour
      }
    );

    for (const media of Page?.media ?? []) {
      if (media && !media.isAdult) {
        byId.set(media.id, toAnimeCard(media));
      }
    }
  }

  return unique.flatMap((id) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
}

/**
 * @param maxAgeMs - How old a cached AniList snapshot may be; `0` always asks AniList.
 * @throws {@link AnimeNotFoundError} for unknown and adult anime.
 */
async function fetchAnimeDetails(anilistId: number, maxAgeMs: number) {
  const { Media } = await anilist(
    AnimeDetailsDocument,
    {
      id: anilistId
    },
    {
      maxAgeMs
    }
  );

  if (!Media || Media.isAdult) {
    throw new AnimeNotFoundError(anilistId);
  }

  return Media;
}

function storedAnimeValues(media: AnimeDetailsFragment) {
  return {
    anilistId: media.id,
    media,
    status: media.status,
    refreshedAt: new Date()
  };
}
