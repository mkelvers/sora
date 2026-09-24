import { and, asc, count, eq, inArray, ne } from "drizzle-orm";

import { getAnime } from "../catalog/queries/anime";
import { browseAnime, type BrowseQuery, type Page } from "../catalog/queries/browse";
import { db } from "../database/client";
import { series, seriesEntry, seriesEpisode, seriesRelated, seriesSeason } from "../database/schema";
import { findEpisodeListings } from "../playback/episodes/versions";
import { AnimeNotFoundError, SeasonNotFoundError, SeriesNotFoundError, UpstreamUnavailableError } from "../errors";
import { scheduleSeriesStore } from "../scheduler/queue";
import { second, startDeadline, timedOut } from "../time";
import { anilistEpisodeKey } from "./episodes";
import type { Season, SeasonEpisode, Series, SeriesCard } from "./models";
import { storedSeriesIds, storeSeries } from "./store";

/**
 * How long a browse request may spend laying out titles that are not stored
 * yet. Once it runs out, the remaining titles are queued for the scheduler.
 */
const browseLayoutBudgetMs = 8 * second;

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

/**
 * Lists a season's episodes, numbered from 1, with the languages each can
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
      isExtra: row.anilistId === null,
      // An extra no provider streams has no languages, and no provider to call it filler.
      languages: listing === null ? [] : (listing?.languages ?? null),
      isFiller: listing?.isFiller ?? null
    };
  });
}

/**
 * Searches and filters the catalog like `browseAnime`, returning one card
 * per title: a search for a show finds the show once, not each of its
 * seasons.
 *
 * Results follow AniList's page of entries, so a page can hold fewer cards
 * than `perPage` when several entries belong to one title. A title found for
 * the first time is laid out on the spot while {@link browseLayoutBudgetMs}
 * lasts, and otherwise queued for the scheduler and left out until it is
 * stored, so a first search for an unknown franchise can come back short.
 *
 * @throws {@link InvalidInputError} when the query fails `BrowseQuerySchema`.
 * @throws {@link UpstreamUnavailableError} when AniList cannot be searched.
 */
export async function browseSeries(query: BrowseQuery): Promise<Page<SeriesCard>> {
  const page = await browseAnime(query);
  const anilistIds = page.items.map((anime) => anime.id);
  const seriesIds = await seriesIdsFor(anilistIds);

  const ordered = [...new Set(anilistIds.flatMap((id) => seriesIds.get(id) ?? []))];
  const rows = ordered.length > 0 ? await db.select().from(series).where(inArray(series.id, ordered)) : [];
  const cards = new Map(rows.map((row) => [row.id, toSeriesCard(row)]));

  return {
    items: ordered.flatMap((id) => cards.get(id) ?? []),
    page: page.page,
    hasNextPage: page.hasNextPage
  };
}

/**
 * Finds the series of each entry, laying out unknown ones within the
 * budget. Each layout stores a whole franchise, so later entries of the
 * same franchise are looked up again rather than laid out.
 *
 * A layout still running when the budget runs out carries on in the
 * background, so a later search finds its series stored.
 */
async function seriesIdsFor(anilistIds: readonly number[]) {
  const found = await storedSeriesIds(anilistIds);
  const deadline = startDeadline(browseLayoutBudgetMs);
  let isOutOfTime = false;

  for (const anilistId of anilistIds) {
    if (found.has(anilistId)) {
      continue;
    }

    if (isOutOfTime) {
      await scheduleSeriesStore(anilistId, "current");
      continue;
    }

    const layout = layOutSeries(anilistId);
    const isStored = await Promise.race([layout, deadline.reached]);
    if (isStored === timedOut) {
      isOutOfTime = true;
      layout.catch((error: unknown) => {
        console.error(`Laying out the series of anime ${anilistId} failed`, error);
      });
      continue;
    }

    if (!isStored) {
      continue;
    }

    const remaining = anilistIds.filter((id) => !found.has(id));
    for (const [id, seriesId] of await storedSeriesIds(remaining)) {
      found.set(id, seriesId);
    }
  }

  deadline.clear();
  return found;
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
