import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "../database/client";
import { anime, series, seriesEpisode, seriesSeason } from "../database/schema";
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

/** What {@link isEpisodeReleased} needs to know about a title. */
export interface ReleaseSchedule {
  nextEpisodeSeasonId: string | null;
  nextEpisodeNumber: number | null;
  nextEpisodeAiringAt: Date | null;
}

/**
 * Whether an episode has been released: it is not at or past the title's
 * announced next episode, and TMDB does not date it in the future.
 */
export function isEpisodeReleased(
  title: ReleaseSchedule,
  episode: {
    seasonId: string;
    number: number;
    /** `YYYY-MM-DD`. */
    airDate: string | null;
  },
  now = new Date()
) {
  const isAtOrAfterNext =
    title.nextEpisodeAiringAt !== null &&
    title.nextEpisodeAiringAt > now &&
    episode.seasonId === title.nextEpisodeSeasonId &&
    title.nextEpisodeNumber !== null &&
    episode.number >= title.nextEpisodeNumber;

  return !isAtOrAfterNext && (episode.airDate === null || episode.airDate <= now.toISOString().slice(0, 10));
}

/**
 * Finds the episode that ends a season: its last playable episode, once the
 * season has finished airing and that episode is out.
 *
 * A season has finished when the AniList entry of its last episode is
 * finished or cancelled. When that entry is not stored, the title's status
 * and announced next episode decide instead.
 *
 * @returns The finale, or `null` while the season is still airing or has no
 *   playable episodes.
 */
export async function getSeasonFinale(seasonId: string): Promise<LocatedEpisode | null> {
  const [row] = await db
    .select({
      seriesId: seriesSeason.seriesId,
      number: seriesEpisode.number,
      anilistId: seriesEpisode.anilistId,
      anilistEpisode: seriesEpisode.anilistEpisode,
      airDate: seriesEpisode.airDate,
      entryStatus: anime.status,
      title: series
    })
    .from(seriesEpisode)
    .innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
    .innerJoin(series, eq(series.id, seriesSeason.seriesId))
    .leftJoin(anime, eq(anime.anilistId, seriesEpisode.anilistId))
    .where(and(eq(seriesEpisode.seasonId, seasonId), isNotNull(seriesEpisode.anilistId)))
    .orderBy(desc(seriesEpisode.number))
    .limit(1);

  if (!row || row.anilistId === null || row.anilistEpisode === null) {
    return null;
  }

  const hasFinished = row.entryStatus
    ? row.entryStatus === "FINISHED" || row.entryStatus === "CANCELLED"
    : row.title.status === "FINISHED" || row.title.nextEpisodeSeasonId !== seasonId;
  if (!hasFinished || !isEpisodeReleased(row.title, { seasonId, number: row.number, airDate: row.airDate })) {
    return null;
  }

  return {
    seriesId: row.seriesId,
    seasonId,
    number: row.number,
    anilistId: row.anilistId,
    anilistEpisode: row.anilistEpisode
  };
}
