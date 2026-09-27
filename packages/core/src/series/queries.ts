import { and, asc, count, eq, inArray, isNotNull, ne } from "drizzle-orm";

import { getAnime } from "../catalog/queries/anime";
import { browseAnime, BrowseQuerySchema, type BrowseQuery, type Page } from "../catalog/queries/browse";
import { hasSearchIndex, searchAnime } from "../catalog/queries/search";
import { db } from "../database/client";
import { series, seriesEntry, seriesEpisode, seriesRelated, seriesSeason } from "../database/schema";
import { getStoredUnits } from "../playback/episodes/episodes";
import { findEpisodeListings } from "../playback/episodes/versions";
import { aniKoto } from "../playback/providers/registry";
import { InvalidInputError, SeasonNotFoundError, SeriesNotFoundError } from "../errors";
import { scheduleSeriesStore } from "../scheduler/queue";
import { anilistEpisodeKey, isEpisodeReleased } from "./episodes";
import type { Season, SeasonEpisode, Series, SeriesCard } from "./models";
import { storedSeriesIds } from "./store";

/**
 * Loads a title's page: its details, seasons, and related titles.
 *
 * Reads only the database: titles are laid out when first found, and the
 * scheduler keeps them current.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function getSeries(seriesId: string): Promise<Series> {
  const [row] = await db.select().from(series).where(eq(series.id, seriesId)).limit(1);
  if (!row) {
    throw new SeriesNotFoundError(seriesId);
  }

  const [anchor, seasons, related] = await Promise.all([
    getAnime(row.anchorAnilistId),
    seasonsOf(row.id),
    relatedOf(row.id)
  ]);

  const isNextEpisodeAhead = row.nextEpisodeAiringAt !== null && row.nextEpisodeAiringAt > new Date();
  return {
    ...toSeriesCard(row),
    startDate: row.startDate,
    overview: row.overview ?? anchor.description,
    genres: anchor.genres,
    tags: anchor.tags,
    studios: anchor.studios,
    score: anchor.score,
    nextEpisode:
      isNextEpisodeAhead && row.nextEpisodeSeasonId !== null && row.nextEpisodeNumber !== null && row.nextEpisodeAiringAt
        ? {
            seasonId: row.nextEpisodeSeasonId,
            number: row.nextEpisodeNumber,
            airingAt: row.nextEpisodeAiringAt.toISOString()
          }
        : null,
    seasons,
    related
  };
}

/**
 * Checks that a series is stored, for operations that take a series ID but
 * do not read the series itself.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function assertSeriesExists(seriesId: string) {
  const [stored] = await db
    .select({
      id: series.id
    })
    .from(series)
    .where(eq(series.id, seriesId))
    .limit(1);
  if (!stored) {
    throw new SeriesNotFoundError(seriesId);
  }
}

/**
 * Loads one season of a series.
 *
 * @throws {@link SeasonNotFoundError} when the season does not exist, or
 *   does not belong to the series.
 */
export async function getSeason(seriesId: string, seasonId: string): Promise<Season> {
  const [season] = await seasonsOf(seriesId, seasonId);
  if (!season) {
    throw new SeasonNotFoundError(seasonId);
  }

  return season;
}

/**
 * Finds the series a season belongs to, for routes that address a season
 * without its series.
 *
 * @throws {@link SeasonNotFoundError} when the season does not exist.
 */
export async function getSeasonSeriesId(seasonId: string): Promise<string> {
  const [season] = await db
    .select({
      seriesId: seriesSeason.seriesId
    })
    .from(seriesSeason)
    .where(eq(seriesSeason.id, seasonId))
    .limit(1);
  if (!season) {
    throw new SeasonNotFoundError(seasonId);
  }

  return season.seriesId;
}

/** An episode, by its season and its position in it. */
export interface EpisodeAddress {
  seasonId: string;
  /** Position within the season, from 1. */
  episode: number;
}

/**
 * The playable episodes before and after one, for moving through a title in
 * order.
 *
 * After a season's last episode comes the first of the next season in watch
 * order, so a show plays on into its next season and the films between its
 * seasons, but not into its extras, which only play on among themselves;
 * before a season's first comes the last of the previous one. Extras only
 * TMDB lists cannot be played, so they are passed over, and `next` is never
 * an episode that has not been released yet. Each is `null` at either end.
 *
 * @throws {@link SeasonNotFoundError} when the season does not exist, or
 *   does not belong to the series.
 */
export async function getAdjacentEpisodes(
  seriesId: string,
  seasonId: string,
  episode: number
): Promise<{
  previous: EpisodeAddress | null;
  next: EpisodeAddress | null;
}> {
  const [seasons, [title]] = await Promise.all([
    seasonsOf(seriesId),
    db.select().from(series).where(eq(series.id, seriesId)).limit(1)
  ]);
  const season = seasons.find((candidate) => candidate.id === seasonId);
  if (!season || !title) {
    throw new SeasonNotFoundError(seasonId);
  }

  const alike = seasons.filter((candidate) => candidate.inWatchOrder === season.inWatchOrder);
  const position = new Map(alike.map((candidate, index) => [candidate.id, index]));
  const playable = (
    await db
      .select({
        seasonId: seriesEpisode.seasonId,
        episode: seriesEpisode.number,
        airDate: seriesEpisode.airDate
      })
      .from(seriesEpisode)
      .where(
        and(
          inArray(
            seriesEpisode.seasonId,
            alike.map((candidate) => candidate.id)
          ),
          isNotNull(seriesEpisode.anilistId)
        )
      )
  ).sort(
    (left, right) =>
      (position.get(left.seasonId) ?? 0) - (position.get(right.seasonId) ?? 0) || left.episode - right.episode
  );

  const isAfter = (address: EpisodeAddress) =>
    (position.get(address.seasonId) ?? 0) - (position.get(seasonId) ?? 0) > 0 ||
    (address.seasonId === seasonId && address.episode > episode);
  const isBefore = (address: EpisodeAddress) =>
    (position.get(address.seasonId) ?? 0) - (position.get(seasonId) ?? 0) < 0 ||
    (address.seasonId === seasonId && address.episode < episode);

  const previous = playable.findLast(isBefore);
  const next = playable.find(isAfter);
  return {
    previous: previous ? { seasonId: previous.seasonId, episode: previous.episode } : null,
    next:
      next && isEpisodeReleased(title, { seasonId: next.seasonId, number: next.episode, airDate: next.airDate })
        ? { seasonId: next.seasonId, episode: next.episode }
        : null
  };
}

/**
 * Lists a season's episodes, numbered from 1, with the audio each can
 * be watched in and whether each is filler. An episode neither TMDB nor
 * AniKoto lists is left out, except a film's.
 *
 * Both come from providers' stored episode lists, so a listing reads only
 * the database. An anime no provider has been looked up for yet is queued
 * for the scheduler, and its episodes' audio is `null` until it has run;
 * the scheduler keeps the lists current as the anime airs.
 *
 * @throws {@link SeasonNotFoundError} when the season does not exist, or
 *   does not belong to the series.
 */
export async function getSeasonEpisodes(seriesId: string, seasonId: string): Promise<SeasonEpisode[]> {
  const season = await getSeason(seriesId, seasonId);

  const rows = await db
    .select()
    .from(seriesEpisode)
    .where(eq(seriesEpisode.seasonId, seasonId))
    .orderBy(asc(seriesEpisode.number));

  const anilistEpisodes = rows.flatMap((row) =>
    row.anilistId !== null && row.anilistEpisode !== null
      ? [
          {
            anilistId: row.anilistId,
            episode: row.anilistEpisode
          }
        ]
      : []
  );
  const [listings, onAniKoto] = await Promise.all([
    findEpisodeListings(anilistEpisodes),
    aniKotoEpisodes(anilistEpisodes.map(({ anilistId }) => anilistId))
  ]);

  // An episode TMDB does not list, such as one AniList counts ahead of its
  // announcement, is shown only once AniKoto streams it. A film is a single
  // announced release that TMDB lists on its own, never as an episode, so it
  // is shown ahead of its release like a listed episode.
  const shown = rows.filter(
    (row) =>
      row.tmdbEpisodeNumber !== null ||
      season.kind === "movie" ||
      (row.anilistId !== null && row.anilistEpisode !== null && onAniKoto.has(anilistEpisodeKey(row.anilistId, row.anilistEpisode)))
  );

  return shown.map((row) => {
    const listing =
      row.anilistId !== null && row.anilistEpisode !== null
        ? listings.get(anilistEpisodeKey(row.anilistId, row.anilistEpisode))
        : null;
    return {
      number: row.number,
      title: row.title,
      overview: row.overview,
      airDate: row.airDate,
      runtimeMinutes: row.runtimeMinutes,
      stillUrl: row.stillUrl,
      // An extra no provider streams has no audio, and no provider to call it filler.
      audio: listing === null ? [] : (listing?.languages ?? null),
      filler: listing?.isFiller ?? false,
      extra: row.anilistId === null
    };
  });
}

/** The episodes AniKoto's stored lists carry, keyed by {@link anilistEpisodeKey}. */
async function aniKotoEpisodes(anilistIds: readonly number[]): Promise<Set<string>> {
  const stored = await getStoredUnits(anilistIds);
  return new Set(
    stored
      .filter((entry) => entry.provider === aniKoto.id)
      .flatMap((entry) => entry.units.map((unit) => anilistEpisodeKey(entry.anilistId, unit.number)))
  );
}

/**
 * Searches and filters the catalog, returning one card per title: a search
 * for a show finds the show once, not each of its seasons.
 *
 * A text search is answered from the local search index (see
 * {@link searchAnime}), ranked by how well titles match and how popular they
 * are. Browsing without one follows AniList's page of entries, so a page can
 * hold fewer cards than `perPage` when several entries belong to one title.
 *
 * Reads only stored titles, so a search never waits on AniList or TMDB. An
 * entry whose title is not stored yet is queued for the scheduler and left
 * out until it is, with `isPreparing` set so the client can ask again; a
 * first search for an unknown franchise comes back short.
 *
 * @throws {@link InvalidInputError} when the query fails `BrowseQuerySchema`.
 * @throws {@link UpstreamUnavailableError} when AniList cannot be browsed.
 */
export async function browseSeries(query: BrowseQuery): Promise<Page<SeriesCard>> {
  const parsed = BrowseQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new InvalidInputError("Invalid browse query", {
      cause: parsed.error
    });
  }

  const { search, page, perPage, ...filters } = parsed.data;
  if (search !== undefined && (await hasSearchIndex())) {
    const ranked = (await searchAnime(search, filters)).map((entry) => entry.anilistId);
    // One series more than the page holds tells whether another page follows.
    const { seriesIds, isPreparing } = await seriesIdsFor(ranked, {
      wantedSeries: page * perPage + 1,
      pageStart: (page - 1) * perPage
    });
    const ordered = seriesInOrder(ranked, seriesIds);
    return {
      items: await cardsOf(ordered.slice((page - 1) * perPage, page * perPage)),
      page,
      perPage,
      hasNextPage: ordered.length > page * perPage,
      isPreparing
    };
  }

  const found = await browseAnime(parsed.data);
  const anilistIds = found.items.map((anime) => anime.id);
  const { seriesIds, isPreparing } = await seriesIdsFor(anilistIds, {
    wantedSeries: Number.POSITIVE_INFINITY,
    pageStart: 0
  });
  return {
    items: await cardsOf(seriesInOrder(anilistIds, seriesIds)),
    page: found.page,
    perPage: found.perPage,
    hasNextPage: found.hasNextPage,
    isPreparing
  };
}

/** The distinct series of `anilistIds`, in the order their entries come. */
function seriesInOrder(anilistIds: readonly number[], seriesIds: ReadonlyMap<number, string>) {
  return [...new Set(anilistIds.flatMap((id) => seriesIds.get(id) ?? []))];
}

/** Cards for stored series, in the given order. */
async function cardsOf(seriesIds: readonly string[]) {
  const rows = seriesIds.length > 0 ? await db.select().from(series).where(inArray(series.id, [...seriesIds])) : [];
  const cards = new Map(rows.map((row) => [row.id, toSeriesCard(row)]));
  return seriesIds.flatMap((id) => cards.get(id) ?? []);
}

/**
 * How many places, from the top of the page asked for, a viewer is taken to
 * be waiting on: entries there not stored yet are laid out ahead of anything
 * else, and those further down after airing checks. Suggestions show six,
 * and a query typed letter by letter should not queue every faint match of
 * each prefix ahead of new episodes.
 */
const waitedPlaces = 6;

/**
 * Finds the stored series of each entry, and queues for the scheduler the
 * entries among the first `window.wantedSeries` places whose series is not
 * stored yet. A stored series takes one place, and so does each entry not
 * stored yet, since its series is not known.
 *
 * @returns Each stored entry's series, and whether entries the page wanted
 *   are still being prepared.
 */
async function seriesIdsFor(
  anilistIds: readonly number[],
  window: {
    wantedSeries: number;
    pageStart: number;
  }
) {
  const found = await storedSeriesIds(anilistIds);
  const seen = new Set<string>();
  const missing: {
    anilistId: number;
    place: number;
  }[] = [];
  for (const anilistId of anilistIds) {
    const place = seen.size + missing.length;
    if (place >= window.wantedSeries) {
      break;
    }

    const seriesId = found.get(anilistId);
    if (seriesId) {
      seen.add(seriesId);
    } else {
      missing.push({
        anilistId,
        place
      });
    }
  }

  const isWaitedOn = (place: number) => place >= window.pageStart && place < window.pageStart + waitedPlaces;
  await Promise.all(
    missing.map(({ anilistId, place }) => scheduleSeriesStore(anilistId, isWaitedOn(place) ? "waiting" : "current"))
  );
  return {
    seriesIds: found,
    isPreparing: missing.length > 0
  };
}

/** A series' seasons in display order, or only `seasonId` among them when given. */
async function seasonsOf(seriesId: string, seasonId?: string): Promise<Season[]> {
  return db
    .select({
      id: seriesSeason.id,
      kind: seriesSeason.kind,
      number: seriesSeason.number,
      title: seriesSeason.title,
      inWatchOrder: seriesSeason.inWatchOrder,
      episodeCount: count(seriesEpisode.number)
    })
    .from(seriesSeason)
    .leftJoin(seriesEpisode, eq(seriesEpisode.seasonId, seriesSeason.id))
    .where(
      and(eq(seriesSeason.seriesId, seriesId), seasonId === undefined ? undefined : eq(seriesSeason.id, seasonId))
    )
    .groupBy(seriesSeason.id)
    .orderBy(asc(seriesSeason.position));
}

/** Related titles that are stored, in display order. Titles still queued for storing are left out. */
async function relatedOf(seriesId: string): Promise<SeriesCard[]> {
  const rows = await db
    .select({
      series
    })
    .from(seriesRelated)
    .innerJoin(seriesEntry, eq(seriesEntry.anilistId, seriesRelated.anilistId))
    .innerJoin(series, eq(series.id, seriesEntry.seriesId))
    .where(and(eq(seriesRelated.seriesId, seriesId), ne(series.id, seriesId)))
    .orderBy(asc(seriesRelated.position));

  const cards = new Map(rows.map((row) => [row.series.id, toSeriesCard(row.series)]));
  return [...cards.values()];
}

/** Builds a card from a stored series row, with any artwork chosen over the laid-out one. */
export function toSeriesCard(row: typeof series.$inferSelect): SeriesCard {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    posterUrl: row.posterUrlOverride ?? row.posterUrl,
    backdropUrl: row.backdropUrlOverride ?? row.backdropUrl,
    logoUrl: row.logoUrlOverride ?? row.logoUrl,
    year: row.startDate ? Number(row.startDate.slice(0, 4)) : null,
    status: row.status
  };
}
