import { and, eq, inArray } from "drizzle-orm";

import { db } from "../database/client";
import { seriesEpisode, seriesSeason } from "../database/schema";
import { EpisodeNotFoundError, SeasonNotFoundError } from "../errors";

/**
 * A season episode together with the AniList episode that plays it.
 *
 * Clients address episodes by season and number; playback, progress, and
 * provider matching are keyed by AniList entry and episode, which survive a
 * series being laid out again.
 */
export interface LocatedEpisode {
  seriesId: string;
  seasonId: string;
  /** Position within the season, from 1. */
  number: number;
  anilistId: number;
  anilistEpisode: number;
}

/** Where an AniList episode sits in its series. */
export interface SeasonEpisodeRef {
  seriesId: string;
  seasonId: string;
  number: number;
}

/**
 * Finds the AniList episode that plays a season episode.
 *
 * @param seriesId - The series the season is addressed under, when it is;
 *   a season of another series is then not found.
 * @throws {@link SeasonNotFoundError} when the season does not exist, or
 *   does not belong to `seriesId`.
 * @throws {@link EpisodeNotFoundError} when the season has no such episode,
 *   or it is an extra only TMDB lists, which nothing streams.
 */
export async function locateEpisode(seasonId: string, number: number, seriesId?: string): Promise<LocatedEpisode> {
  const [row] = await db
    .select({
      seriesId: seriesSeason.seriesId,
      anilistId: seriesEpisode.anilistId,
      anilistEpisode: seriesEpisode.anilistEpisode
    })
    .from(seriesSeason)
    .leftJoin(seriesEpisode, and(eq(seriesEpisode.seasonId, seriesSeason.id), eq(seriesEpisode.number, number)))
    .where(eq(seriesSeason.id, seasonId))
    .limit(1);

  if (!row || (seriesId !== undefined && row.seriesId !== seriesId)) {
    throw new SeasonNotFoundError(seasonId);
  }

  if (row.anilistId === null || row.anilistEpisode === null) {
    throw new EpisodeNotFoundError(seasonId, number);
  }

  return {
    seriesId: row.seriesId,
    seasonId,
    number,
    anilistId: row.anilistId,
    anilistEpisode: row.anilistEpisode
  };
}

/**
 * Finds where AniList episodes sit in their stored series.
 *
 * Episodes of entries no stored series contains are left out.
 *
 * @param options.placeUnlisted - Also place episodes the layout does not
 *   list yet. While AniList does not know an entry's episode count, its
 *   season lists only aired episodes; an upcoming one is placed right after
 *   the entry's latest listed episode.
 * @returns Positions keyed by {@link anilistEpisodeKey}.
 */
export async function findSeasonEpisodes(
  episodes: readonly {
    anilistId: number;
    episode: number;
  }[],
  options: {
    placeUnlisted: boolean;
  }
): Promise<Map<string, SeasonEpisodeRef>> {
  const found = new Map<string, SeasonEpisodeRef>();
  if (episodes.length === 0) {
    return found;
  }

  const rows = await db
    .select({
      seriesId: seriesSeason.seriesId,
      seasonId: seriesEpisode.seasonId,
      number: seriesEpisode.number,
      anilistId: seriesEpisode.anilistId,
      anilistEpisode: seriesEpisode.anilistEpisode
    })
    .from(seriesEpisode)
    .innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
    .where(inArray(seriesEpisode.anilistId, [...new Set(episodes.map((episode) => episode.anilistId))]));

  const listed = new Map<string, SeasonEpisodeRef>();
  const latest = new Map<
    number,
    {
      anilistEpisode: number;
      ref: SeasonEpisodeRef;
    }
  >();
  for (const row of rows) {
    if (row.anilistId === null || row.anilistEpisode === null) {
      continue;
    }

    const ref = {
      seriesId: row.seriesId,
      seasonId: row.seasonId,
      number: row.number
    };
    listed.set(anilistEpisodeKey(row.anilistId, row.anilistEpisode), ref);

    const previous = latest.get(row.anilistId);
    if (!previous || row.anilistEpisode > previous.anilistEpisode) {
      latest.set(row.anilistId, {
        anilistEpisode: row.anilistEpisode,
        ref
      });
    }
  }

  for (const { anilistId, episode } of episodes) {
    const key = anilistEpisodeKey(anilistId, episode);
    const exact = listed.get(key);
    const last = latest.get(anilistId);
    if (exact) {
      found.set(key, exact);
    } else if (options.placeUnlisted && last && episode > last.anilistEpisode) {
      found.set(key, {
        ...last.ref,
        number: last.ref.number + (episode - last.anilistEpisode)
      });
    }
  }

  return found;
}

/** The key {@link findSeasonEpisodes} files an AniList episode under. */
export function anilistEpisodeKey(anilistId: number, episode: number) {
  return `${anilistId}:${episode}`;
}
