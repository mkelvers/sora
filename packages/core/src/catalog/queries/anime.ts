import { anilist } from "../../anilist/client";
import { AnimeCardsDocument, AnimeDetailsDocument } from "../../anilist/graphql.generated";
import { AnimeNotFoundError } from "../../errors";
import { hour } from "../../time";
import { toAnime, toAnimeCard, type Anime, type AnimeCard } from "../models/anime";

/**
 * Loads the full details of one anime.
 *
 * Details are served from cache for up to an hour, which keeps the
 * next-episode countdown accurate without spending AniList's rate limit.
 *
 * @throws {@link AnimeNotFoundError} when the ID is unknown to AniList, or
 *   belongs to adult media, which the catalog never serves.
 */
export async function getAnime(anilistId: number): Promise<Anime> {
  const { Media } = await anilist(
    AnimeDetailsDocument,
    {
      id: anilistId
    },
    {
      maxAgeMs: hour
    }
  );

  if (!Media || Media.isAdult) {
    throw new AnimeNotFoundError(anilistId);
  }

  return toAnime(Media);
}

/**
 * Loads cards for many anime in one request, preserving the order of `ids`.
 *
 * Unknown and adult IDs are omitted rather than failing the whole batch,
 * because the IDs usually come from stored user data that may predate a
 * removal on AniList.
 */
export async function getAnimeCards(ids: readonly number[]): Promise<AnimeCard[]> {
  const unique = [...new Set(ids)];
  const byId = new Map<number, AnimeCard>();

  // AniList pages are capped at 50 entries.
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50).sort((left, right) => left - right);
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
