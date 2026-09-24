import { and, asc, count, eq, inArray, ne } from "drizzle-orm";

import { getAnime } from "../catalog/queries/anime";
import { browseAnime, type BrowseQuery, type Page } from "../catalog/queries/browse";
import { db } from "../database/client";
import { series, seriesEntry, seriesEpisode, seriesRelated, seriesSeason } from "../database/schema";
import { findEpisodeLanguages } from "../playback/episodes/versions";
import { AnimeNotFoundError, SeasonNotFoundError, SeriesNotFoundError, UpstreamUnavailableError } from "../errors";
import { scheduleSeriesStore } from "../scheduler/queue";
import { second } from "../time";
import { anilistEpisodeKey } from "./episodes";
import type { Season, SeasonEpisode, Series, SeriesCard } from "./models";
import { storedSeriesIds, storeSeries } from "./store";

/**
 * How long a browse request may spend laying out titles that are not stored
 * yet. Once it runs out, the remaining titles are queued for the scheduler.
 */
const browseLayoutBudgetMs = 8 * second;

/**
 * How long listing a season's episodes may spend looking its anime up on
 * providers to learn which languages each episode has. Episodes of an anime
 * still being looked up have unknown languages until a later listing.
 */
const episodeLanguagesBudgetMs = 3 * second;

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
 * Lists a season's episodes, numbered from 1, with the languages each can
 * be watched in.
 *
 * Languages come from providers' episode lists. A season whose anime no one
 * has looked up yet spends up to {@link episodeLanguagesBudgetMs} matching it
 * on providers, and lists `null` languages for what that did not cover.
 *
 * @throws {@link SeasonNotFoundError} when the ID does not identify a season.
 */
export async function getSeasonEpisodes(seasonId: string): Promise<SeasonEpisode[]> {
  const [season] = await db
    .select({
      id: seriesSeason.id
    })
    .from(seriesSeason)
    .where(eq(seriesSeason.id, seasonId))
    .limit(1);
  if (!season) {
    throw new SeasonNotFoundError(seasonId);
  }

  const rows = await db
    .select()
    .from(seriesEpisode)
    .where(eq(seriesEpisode.seasonId, seasonId))
    .orderBy(asc(seriesEpisode.number));

  const languages = await findEpisodeLanguages(
    rows.flatMap((row) =>
      row.anilistId !== null && row.anilistEpisode !== null
        ? [
            {
              anilistId: row.anilistId,
              episode: row.anilistEpisode
            }
          ]
        : []
    ),
    episodeLanguagesBudgetMs
  );

  return rows.map((row) => ({
    number: row.number,
    title: row.title,
    overview: row.overview,
    airDate: row.airDate,
    runtimeMinutes: row.runtimeMinutes,
    stillUrl: row.stillUrl,
    isExtra: row.anilistId === null,
    languages:
      row.anilistId !== null && row.anilistEpisode !== null
        ? (languages.get(anilistEpisodeKey(row.anilistId, row.anilistEpisode)) ?? null)
        : []
  }));
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
 */
async function seriesIdsFor(anilistIds: readonly number[]) {
  const started = Date.now();
  const found = await storedSeriesIds(anilistIds);

  for (const anilistId of anilistIds) {
    if (found.has(anilistId)) {
      continue;
    }

    if (Date.now() - started >= browseLayoutBudgetMs) {
      await scheduleSeriesStore(anilistId, "current");
      continue;
    }

    try {
      await storeSeries(anilistId);
    } catch (error) {
      if (error instanceof UpstreamUnavailableError) {
        await scheduleSeriesStore(anilistId, "current");
        continue;
      }

      if (error instanceof AnimeNotFoundError) {
        continue;
      }

      throw error;
    }

    const remaining = anilistIds.filter((id) => !found.has(id));
    for (const [id, seriesId] of await storedSeriesIds(remaining)) {
      found.set(id, seriesId);
    }
  }

  return found;
}

async function seasonsOf(seriesId: string): Promise<Season[]> {
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
    .where(eq(seriesSeason.seriesId, seriesId))
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
