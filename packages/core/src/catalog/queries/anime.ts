import { eq, inArray } from "drizzle-orm";

import { anilist } from "../../anilist/client";
import { AnimeCardsDocument, AnimeDetailsDocument, type AnimeDetailsFragment } from "../../anilist/graphql.generated";
import { db } from "../../database/client";
import { anime as animeTable } from "../../database/schema";
import { AnimeNotFoundError } from "../../errors";
import { startTrackingAiring } from "../../scheduler/queue";
import { day, hour } from "../../time";
import { toAnime, toAnimeCard, type Anime, type AnimeCard } from "../models/anime";

/**
 * Loads the full details of one anime.
 *
 * The first request fetches the anime from AniList and stores it for good;
 * every later request is served from the database. An anime that is still
 * airing, or finished recently, is handed to the airing scheduler, which keeps
 * the stored copy current until its final episode is out.
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

  if (mayGainEpisodes(media, new Date())) {
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
 * Finales often reach providers a day or more after they air, while AniList
 * marks the anime finished right away. An anime that finished within this
 * window is still tracked until its last episode is released.
 */
const recentlyFinishedMs = 14 * day;

/**
 * Whether the airing scheduler needs to follow an anime: it is still airing,
 * or finished so recently that providers may not carry every episode yet.
 */
export function mayGainEpisodes(media: Pick<AnimeDetailsFragment, "status" | "endDate">, now: Date) {
  switch (media.status) {
    case "RELEASING":
    case "NOT_YET_RELEASED":
    case "HIATUS":
      return true;
    case "FINISHED": {
      const end = media.endDate;
      if (!end?.year || !end.month || !end.day) {
        return false;
      }

      return now.getTime() - Date.UTC(end.year, end.month - 1, end.day) < recentlyFinishedMs;
    }
    default:
      return false;
  }
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
  const byId = await getStoredAnimeCards(unique);
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
 * Cards for the anime among `ids` that the catalog has stored, by AniList ID.
 * Anime that are not stored are left out; nothing is fetched.
 *
 * The airing scheduler keeps stored anime current, so these are fresher
 * than cached AniList responses for anime that are still airing.
 */
export async function getStoredAnimeCards(ids: readonly number[]): Promise<Map<number, AnimeCard>> {
  if (ids.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      media: animeTable.media
    })
    .from(animeTable)
    .where(inArray(animeTable.anilistId, [...new Set(ids)]));

  return new Map(rows.map((row) => [row.media.id, toAnimeCard(row.media)]));
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
