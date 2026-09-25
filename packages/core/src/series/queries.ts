import { and, asc, count, eq, inArray, isNotNull, ne } from "drizzle-orm";

import { getAnime } from "../catalog/queries/anime";
import { browseAnime, BrowseQuerySchema, type BrowseQuery, type Page } from "../catalog/queries/browse";
import { hasSearchIndex, searchAnime } from "../catalog/queries/search";
import { db } from "../database/client";
import { series, seriesEntry, seriesEpisode, seriesRelated, seriesSeason } from "../database/schema";
import { findEpisodeListings } from "../playback/episodes/versions";
import {
  AnimeNotFoundError,
  InvalidInputError,
  SeasonNotFoundError,
  SeriesNotFoundError,
  UpstreamUnavailableError
} from "../errors";
import { scheduleSeriesStore } from "../scheduler/queue";
import { second, startDeadline, timedOut } from "../time";
import { anilistEpisodeKey } from "./episodes";
import type { Season, SeasonEpisode, Series, SeriesCard } from "./models";
import { storedSeriesIds, storeSeries } from "./store";

/**
 * How long a browse request may spend laying out titles that are not stored
 * yet. Once it runs out, the remaining titles are queued for the scheduler.
 * A layout takes a few AniList requests, 8–10 seconds while AniList runs at
 * its degraded limit of 30 a minute; the scheduler's backfill lays out
 * popular titles ahead of any search, so few searches wait at all.
 */
const browseLayoutBudgetMs = 12 * second;

/**
 * Layouts a browse request runs at once. AniList's rate limit, shared by
 * every request, bounds how fast they go, not this.
 */
const browseLayoutConcurrency = 2;

/**
 * How many of the first places of a page a browse request waits for titles
 * to be laid out in. Further down, titles not stored yet are queued rather
 * than waited for: a search should not wait on its tenth-best match.
 */
const awaitedPlaces = 3;

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
    overview: row.overview ?? anchor.description,
    genres: anchor.genres,
    tags: anchor.tags,
    studios: anchor.studios,
    score: anchor.score,
    trailer: anchor.trailer,
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
 * After a season's last episode comes the first of the next season of the
 * same kind, so a show plays on into its next season but not into its films;
 * before a season's first comes the last of the previous one. Extras only
 * TMDB lists cannot be played, so they are passed over. Each is `null` at
 * either end.
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
  const seasons = await seasonsOf(seriesId);
  const season = seasons.find((candidate) => candidate.id === seasonId);
  if (!season) {
    throw new SeasonNotFoundError(seasonId);
  }

  const alike = seasons.filter((candidate) => candidate.kind === season.kind);
  const position = new Map(alike.map((candidate, index) => [candidate.id, index]));
  const playable = (
    await db
      .select({
        seasonId: seriesEpisode.seasonId,
        episode: seriesEpisode.number
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

  return {
    previous: playable.findLast(isBefore) ?? null,
    next: playable.find(isAfter) ?? null
  };
}

/**
 * Lists a season's episodes, numbered from 1, with the audio each can
 * be watched in and whether each is filler.
 *
 * Both come from providers' episode lists. The first listing of an anime
 * no provider has been looked up for yet looks it up and stores the lists;
 * every later listing only reads them, and the scheduler keeps them current
 * as the anime airs.
 *
 * @throws {@link SeasonNotFoundError} when the season does not exist, or
 *   does not belong to the series.
 */
export async function getSeasonEpisodes(seriesId: string, seasonId: string): Promise<SeasonEpisode[]> {
  await getSeason(seriesId, seasonId);

  const rows = await db
    .select()
    .from(seriesEpisode)
    .where(eq(seriesEpisode.seasonId, seasonId))
    .orderBy(asc(seriesEpisode.number));

  const listings = await findEpisodeListings(
    rows.flatMap((row) =>
      row.anilistId !== null && row.anilistEpisode !== null
        ? [
            {
              anilistId: row.anilistId,
              episode: row.anilistEpisode
            }
          ]
        : []
    )
  );

  return rows.map((row) => {
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

/**
 * Searches and filters the catalog, returning one card per title: a search
 * for a show finds the show once, not each of its seasons.
 *
 * A text search is answered from the local search index (see
 * {@link searchAnime}), ranked by how well titles match and how popular they
 * are. Browsing without one follows AniList's page of entries, so a page can
 * hold fewer cards than `perPage` when several entries belong to one title.
 *
 * A title found for the first time is laid out on the spot while
 * {@link browseLayoutBudgetMs} lasts, and otherwise queued for the scheduler
 * and left out until it is stored, so a first search for an unknown
 * franchise can come back short.
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
      awaitedFrom: (page - 1) * perPage
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
    awaitedFrom: 0
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
 * Finds the series of each entry, in the order the entries come, until the
 * first `wantedSeries` series are known.
 *
 * Entries not stored yet among the {@link awaitedPlaces} places from
 * `awaitedFrom` on, the top of the page being asked for, are laid out while
 * the request waits, {@link browseLayoutConcurrency} at a time, until the
 * budget runs out. Each layout stores a whole franchise, so entries of a
 * franchise already laid out are looked up rather than laid out again.
 *
 * Every other entry not stored yet is queued for the scheduler, and a layout
 * still running when the budget runs out carries on in the background, so a
 * later request finds their series stored.
 *
 * @returns Each stored entry's series, and whether entries the page wanted
 *   are still being prepared.
 */
async function seriesIdsFor(
  anilistIds: readonly number[],
  window: {
    wantedSeries: number;
    awaitedFrom: number;
  }
) {
  const found = await storedSeriesIds(anilistIds);
  const attempted = new Set<number>();
  /** Entries whose layout finished without a series, such as one AniList no longer has. */
  const unplaceable = new Set<number>();
  const deadline = startDeadline(browseLayoutBudgetMs);
  let isOutOfTime = false;
  void deadline.reached.then(() => {
    isOutOfTime = true;
  });

  /**
   * The entries not stored yet among the wanted places, each with its place:
   * a stored series takes one place, and so does each entry not stored yet,
   * since its series is not known.
   */
  const unresolved = () => {
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

    return missing;
  };

  const isAwaited = (place: number) => place >= window.awaitedFrom && place < window.awaitedFrom + awaitedPlaces;
  const layOutNext = async () => {
    for (;;) {
      const next = unresolved().find(({ anilistId, place }) => isAwaited(place) && !attempted.has(anilistId));
      if (next === undefined || isOutOfTime) {
        return;
      }

      attempted.add(next.anilistId);
      const layout = layOutSeries(next.anilistId);
      const isStored = await Promise.race([layout, deadline.reached]);
      if (isStored === timedOut) {
        layout.catch((error: unknown) => {
          console.error(`Laying out the series of anime ${next.anilistId} failed`, error);
        });
        return;
      }

      if (!isStored) {
        unplaceable.add(next.anilistId);
        continue;
      }

      for (const [id, seriesId] of await storedSeriesIds(anilistIds.filter((id) => !found.has(id)))) {
        found.set(id, seriesId);
      }
    }
  };

  await Promise.all(Array.from({ length: browseLayoutConcurrency }, layOutNext));
  deadline.clear();

  const stillMissing = unresolved();
  for (const { anilistId } of stillMissing.filter(({ anilistId }) => !attempted.has(anilistId))) {
    await scheduleSeriesStore(anilistId, "current");
  }

  return {
    seriesIds: found,
    isPreparing: stillMissing.some(({ anilistId }) => !unplaceable.has(anilistId))
  };
}

/**
 * Layouts in flight, keyed by AniList ID, so a search repeated while one is
 * running waits on it instead of starting another.
 */
const layoutsInFlight = new Map<number, Promise<boolean>>();

/**
 * Stores the series of an entry, queueing it for the scheduler when AniList
 * or TMDB fail. Resolves whether the series was stored.
 */
function layOutSeries(anilistId: number): Promise<boolean> {
  const running = layoutsInFlight.get(anilistId);
  if (running) {
    return running;
  }

  const layout = storeSeries(anilistId)
    .then(
      () => true,
      async (error: unknown) => {
        if (error instanceof UpstreamUnavailableError) {
          await scheduleSeriesStore(anilistId, "current");
          return false;
        }

        if (error instanceof AnimeNotFoundError) {
          return false;
        }

        throw error;
      }
    )
    .finally(() => layoutsInFlight.delete(anilistId));
  layoutsInFlight.set(anilistId, layout);
  return layout;
}

/** A series' seasons in display order, or only `seasonId` among them when given. */
async function seasonsOf(seriesId: string, seasonId?: string): Promise<Season[]> {
  return db
    .select({
      id: seriesSeason.id,
      kind: seriesSeason.kind,
      number: seriesSeason.number,
      title: seriesSeason.title,
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

/** Builds a card from a stored series row. */
export function toSeriesCard(row: typeof series.$inferSelect): SeriesCard {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    posterUrl: row.posterUrl,
    backdropUrl: row.backdropUrl,
    logoUrl: row.logoUrl,
    year: row.startDate ? Number(row.startDate.slice(0, 4)) : null,
    status: row.status
  };
}
