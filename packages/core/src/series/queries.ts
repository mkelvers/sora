import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { toAnime, toAnimeFormat } from "../catalog/models/anime";
import { getAnime } from "../catalog/queries/anime";
import { browseAnime, BrowseQuerySchema, type BrowseQuery, type Page } from "../catalog/queries/browse";
import { hasSearchIndex, searchAnime } from "../catalog/queries/search";
import { db } from "../database/client";
import { anime as animeTable, series, seriesEntry, seriesEpisode, seriesRelated, seriesSeason } from "../database/schema";
import { findAnimeLanguages, findEpisodeListings } from "../playback/episodes/versions";
import { InvalidInputError, SeasonNotFoundError, SeriesNotFoundError } from "../errors";
import { scheduleSeriesStore } from "../scheduler/queue";
import { anilistEpisodeKey, isEpisodeShown, loadAniKotoEpisodes } from "./episodes";
import type { ContentLanguage, PreparingTitle, Season, SeasonEpisode, Series, SeriesCard } from "./models";
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

  const [anchor, listed, related] = await Promise.all([
    getAnime(row.anchorAnilistId),
    listedSeasonsOf([row]),
    relatedOf(row.id)
  ]);
  const cards = await cardsFrom([row], listed);

  const isNextEpisodeAhead = row.nextEpisodeAiringAt !== null && row.nextEpisodeAiringAt > new Date();
  return {
    ...cards.get(row.id)!,
    startDate: row.startDate,
    genres: anchor.genres,
    tags: anchor.tags,
    studios: anchor.studios,
    nextEpisode:
      isNextEpisodeAhead && row.nextEpisodeSeasonId !== null && row.nextEpisodeNumber !== null && row.nextEpisodeAiringAt
        ? {
            seasonId: row.nextEpisodeSeasonId,
            number: row.nextEpisodeNumber,
            airingAt: row.nextEpisodeAiringAt.toISOString(),
          }
        : null,
    seasons: (listed.get(row.id) ?? []).map(({ season }) => season),
    related,
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
      id: series.id,
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
      seriesId: seriesSeason.seriesId,
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
 * before a season's first comes the last of the previous one. Only the
 * episodes seasons list count (see {@link isEpisodeShown}), less extras only
 * TMDB lists, which cannot be played; so `next` is never an episode AniKoto
 * does not carry yet. Each is `null` at either end.
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
  const seasons = await listedSeasons(seriesId);
  const season = seasons.find((candidate) => candidate.season.id === seasonId)?.season;
  if (!season) {
    throw new SeasonNotFoundError(seasonId);
  }

  const alike = seasons.filter((candidate) => candidate.season.inWatchOrder === season.inWatchOrder);
  const position = new Map(alike.map((candidate, index) => [candidate.season.id, index]));
  const playable = alike.flatMap((candidate) =>
    candidate.episodes.flatMap((row) =>
      row.anilistId === null
        ? []
        : [
            {
              seasonId: row.seasonId,
              episode: row.number,
            }
          ]
    )
  );

  const isAfter = (address: EpisodeAddress) =>
    (position.get(address.seasonId) ?? 0) - (position.get(seasonId) ?? 0) > 0 ||
    (address.seasonId === seasonId && address.episode > episode);
  const isBefore = (address: EpisodeAddress) =>
    (position.get(address.seasonId) ?? 0) - (position.get(seasonId) ?? 0) < 0 ||
    (address.seasonId === seasonId && address.episode < episode);

  return {
    previous: playable.findLast(isBefore) ?? null,
    next: playable.find(isAfter) ?? null,
  };
}

/**
 * Lists a season's episodes, numbered from 1, with the audio each can
 * be watched in and whether each is filler.
 *
 * AniKoto decides which episodes exist: an episode is listed once AniKoto
 * carries it and it has its details, as {@link isEpisodeShown} lays out.
 * An extra only TMDB lists is listed too.
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
  const [listed] = await listedSeasons(seriesId, seasonId);
  if (!listed) {
    throw new SeasonNotFoundError(seasonId);
  }

  const listings = await findEpisodeListings(
    listed.episodes.flatMap((row) =>
      row.anilistId !== null && row.anilistEpisode !== null
        ? [
            {
              anilistId: row.anilistId,
              episode: row.anilistEpisode,
            }
          ]
        : []
    )
  );

  return listed.episodes.map((row) => {
    const listing =
      row.anilistId !== null && row.anilistEpisode !== null
        ? listings.get(anilistEpisodeKey(row.anilistId, row.anilistEpisode))
        : null;
    return {
      number: row.number,
      title: row.title,
      overview: row.overview,
      airDate: row.airDate,
      airedAt: row.airedAt?.toISOString() ?? null,
      runtimeMinutes: row.runtimeMinutes,
      stillUrl: row.stillUrl,
      // An extra no provider streams has no audio, and no provider to call it filler.
      audio: listing === null ? [] : (listing?.languages ?? null),
      filler: listing?.isFiller ?? false,
      extra: row.anilistId === null,
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
 * Reads only stored titles, so a search never waits on AniList or TMDB. An
 * entry whose title is not stored yet is queued for the scheduler and left
 * out of `items` until it is, with `isPreparing` set so the client can ask
 * again. Those on the page are listed in `preparing`, with what the search
 * index knows of them and where they are expected, so a client can show
 * them at once rather than a page that comes back short.
 *
 * @throws {@link InvalidInputError} when the query fails `BrowseQuerySchema`.
 * @throws {@link UpstreamUnavailableError} when AniList cannot be browsed.
 */
export async function browseSeries(query: BrowseQuery): Promise<Page<SeriesCard> & {
  preparing: PreparingTitle[];
}> {
  const parsed = BrowseQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new InvalidInputError("Invalid browse query", {
      cause: parsed.error,
    });
  }

  const {
    search,
    page,
    perPage,
    ...filters
  } = parsed.data;
  if (search !== undefined && (await hasSearchIndex())) {
    const found = await searchAnime(search, filters);
    const ranked = found.map((entry) => entry.anilistId);
    const pageStart = (page - 1) * perPage;
    // One series more than the page holds tells whether another page follows.
    const {
      seriesIds,
      missing,
    } = await seriesIdsFor(ranked, {
      wantedSeries: page * perPage + 1,
      pageStart,
      perPage,
    });
    const ordered = seriesInOrder(ranked, seriesIds);
    const indexed = new Map(found.map((entry) => [entry.anilistId, entry]));
    return {
      items: await cardsOf(ordered.slice(pageStart, page * perPage)),
      page,
      perPage,
      hasNextPage: ordered.length > page * perPage,
      isPreparing: missing.length > 0,
      preparing: preparingOn(missing, pageStart, perPage, (anilistId) => {
        const entry = indexed.get(anilistId);
        return entry && {
          title: entry.english ?? entry.romaji ?? entry.native,
          format: toAnimeFormat(entry.format),
          year: entry.seasonYear ?? (entry.startDate ? Number(entry.startDate.slice(0, 4)) : null),
        };
      }),
    };
  }

  const found = await browseAnime(parsed.data);
  const anilistIds = found.items.map((anime) => anime.id);
  const {
    seriesIds,
    missing,
  } = await seriesIdsFor(anilistIds, {
    wantedSeries: Number.POSITIVE_INFINITY,
    pageStart: 0,
    perPage: found.perPage,
  });
  const cards = new Map(found.items.map((anime) => [anime.id, anime]));
  return {
    items: await cardsOf(seriesInOrder(anilistIds, seriesIds)),
    page: found.page,
    perPage: found.perPage,
    hasNextPage: found.hasNextPage,
    isPreparing: missing.length > 0,
    preparing: preparingOn(missing, 0, Number.POSITIVE_INFINITY, (anilistId) => {
      const anime = cards.get(anilistId);
      return anime && {
        title: anime.title.display,
        format: anime.format,
        year: anime.seasonYear,
      };
    }),
  };
}

/**
 * The titles not stored yet among a page's places, where they are expected
 * on it, described by `describe`. Entries it knows nothing about are left
 * out.
 */
function preparingOn(
  missing: readonly {
    anilistId: number;
    place: number;
  }[],
  pageStart: number,
  perPage: number,
  describe: (anilistId: number) => Omit<PreparingTitle, "anilistId" | "position" | "title"> & {
    title: string | null;
  } | undefined
): PreparingTitle[] {
  return missing.flatMap(({ anilistId, place }) => {
    const described = describe(anilistId);
    const position = place - pageStart;
    return described?.title && position >= 0 && position < perPage
      ? [{
        ...described,
        anilistId,
        title: described.title,
        position,
      }]
      : [];
  });
}

/** The distinct series of `anilistIds`, in the order their entries come. */
function seriesInOrder(anilistIds: readonly number[], seriesIds: ReadonlyMap<number, string>) {
  return [...new Set(anilistIds.flatMap((id) => seriesIds.get(id) ?? []))];
}

/** Cards for stored series, in the given order. */
async function cardsOf(seriesIds: readonly string[]) {
  const rows = seriesIds.length > 0 ? await db.select().from(series).where(inArray(series.id, [...seriesIds])) : [];
  const cards = await toSeriesCards(rows);
  return seriesIds.flatMap((id) => cards.get(id) ?? []);
}

/**
 * Finds the stored series of each entry, and queues for the scheduler the
 * entries among the first `window.wantedSeries` places whose series is not
 * stored yet. A stored series takes one place, and so does each entry not
 * stored yet, since its series is not known.
 *
 * The viewer is taken to be waiting on the page they asked for, the
 * `window.perPage` places from `window.pageStart`: entries there are laid
 * out ahead of anything else, and those further down after airing checks.
 * Suggestions ask for a small page, so a query typed letter by letter does
 * not queue every faint match of each prefix ahead of new episodes.
 *
 * @returns Each stored entry's series, and the entries the page wanted that
 *   are still being prepared, with their places.
 */
async function seriesIdsFor(
  anilistIds: readonly number[],
  window: {
    wantedSeries: number;
    pageStart: number;
    perPage: number;
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
        place,
      });
    }
  }

  const isWaitedOn = (place: number) => place >= window.pageStart && place < window.pageStart + window.perPage;
  await Promise.all(
    missing.map(({ anilistId, place }) =>
      isWaitedOn(place) ? scheduleSeriesStore(anilistId, "waiting", place - window.pageStart) : scheduleSeriesStore(anilistId, "current")
    )
  );
  return {
    seriesIds: found,
    missing,
  };
}

/** A series' seasons in display order, or only `seasonId` among them when given. */
async function seasonsOf(seriesId: string, seasonId?: string): Promise<Season[]> {
  return (await listedSeasons(seriesId, seasonId)).map(({ season }) => season);
}

/**
 * A series' seasons in display order, or only `seasonId` among them when
 * given, each with the episodes it lists (see {@link isEpisodeShown}) in
 * order. `episodeCount` counts only those.
 */
async function listedSeasons(seriesId: string, seasonId?: string) {
  const [title] = await db.select().from(series).where(eq(series.id, seriesId)).limit(1);
  return title ? ((await listedSeasonsOf([title], seasonId)).get(title.id) ?? []) : [];
}

/** {@link listedSeasons} of several series at once, keyed by series ID. */
async function listedSeasonsOf(titles: readonly (typeof series.$inferSelect)[], seasonId?: string) {
  const seasons =
    titles.length > 0
      ? await db
          .select({
            seriesId: seriesSeason.seriesId,
            id: seriesSeason.id,
            kind: seriesSeason.kind,
            number: seriesSeason.number,
            title: seriesSeason.title,
            inWatchOrder: seriesSeason.inWatchOrder,
          })
          .from(seriesSeason)
          .where(
            and(
              inArray(
                seriesSeason.seriesId,
                titles.map((title) => title.id)
              ),
              seasonId === undefined ? undefined : eq(seriesSeason.id, seasonId)
            )
          )
          .orderBy(asc(seriesSeason.position))
      : [];
  const rows =
    seasons.length > 0
      ? await db
          .select()
          .from(seriesEpisode)
          .where(
            inArray(
              seriesEpisode.seasonId,
              seasons.map((season) => season.id)
            )
          )
          .orderBy(asc(seriesEpisode.number))
      : [];
  const onAniKoto = await loadAniKotoEpisodes(rows.flatMap((row) => row.anilistId ?? []));

  const now = new Date();
  return new Map(
    titles.map((title) => [
      title.id,
      seasons
        .filter((season) => season.seriesId === title.id)
        .map(({ seriesId: _, ...season }) => {
          const episodes = rows.filter(
            (row) => row.seasonId === season.id && isEpisodeShown(title, season, row, onAniKoto, now)
          );
          return {
            season: {
              ...season,
              episodeCount: episodes.length,
            },
            episodes,
          };
        })
    ])
  );
}

/** Related titles that are stored, in display order. Titles still queued for storing are left out. */
async function relatedOf(seriesId: string): Promise<SeriesCard[]> {
  const rows = await db
    .select({
      series,
    })
    .from(seriesRelated)
    .innerJoin(seriesEntry, eq(seriesEntry.anilistId, seriesRelated.anilistId))
    .innerJoin(series, eq(series.id, seriesEntry.seriesId))
    .where(and(eq(seriesRelated.seriesId, seriesId), ne(series.id, seriesId)))
    .orderBy(asc(seriesRelated.position));

  const cards = await toSeriesCards(rows.map((row) => row.series));
  return [...cards.values()];
}

/** Builds a card from a stored series row, with any artwork chosen over the laid-out one. */
function toSeriesCard(
  row: typeof series.$inferSelect,
  audio: ContentLanguage[]
): Omit<SeriesCard, "overview" | "score" | "genres" | "seasonCount" | "episodeCount" | "startSeasonId"> {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    posterUrl: row.posterUrlOverride ?? row.posterUrl,
    backdropUrl: row.backdropUrlOverride ?? row.backdropUrl,
    logoUrl: row.logoUrlOverride ?? row.logoUrl,
    year: row.startDate ? Number(row.startDate.slice(0, 4)) : null,
    status: row.status,
    audio,
  };
}

/**
 * Builds the cards of stored series rows, keyed by series ID, with the audio
 * and the seasons and episodes each series lists. Reads only the database.
 */
export async function toSeriesCards(rows: readonly (typeof series.$inferSelect)[]): Promise<Map<string, SeriesCard>> {
  return cardsFrom(rows, await listedSeasonsOf(rows));
}

/** {@link toSeriesCards} with the rows' seasons already listed. */
async function cardsFrom(
  rows: readonly (typeof series.$inferSelect)[],
  listed: Map<string, Awaited<ReturnType<typeof listedSeasons>>>
): Promise<Map<string, SeriesCard>> {
  const ids = [...new Set(rows.map((row) => row.id))];
  const [entries, anchors] =
    ids.length > 0
      ? await Promise.all([
          db
            .select({
              anilistId: seriesEntry.anilistId,
              seriesId: seriesEntry.seriesId,
            })
            .from(seriesEntry)
            .where(inArray(seriesEntry.seriesId, ids)),
          db
            .select({
              anilistId: animeTable.anilistId,
              media: animeTable.media,
            })
            .from(animeTable)
            .where(
              inArray(
                animeTable.anilistId,
                rows.map((row) => row.anchorAnilistId)
              )
            )
        ])
      : [[], []];
  const languages = await findAnimeLanguages(entries.map((entry) => entry.anilistId));
  const anime = new Map(anchors.map((anchor) => [anchor.anilistId, toAnime(anchor.media)]));
  const order: ContentLanguage[] = ["dub", "sub", "raw"];

  return new Map(
    rows.map((row) => {
      const audio = new Set(
        entries.flatMap((entry) => (entry.seriesId === row.id ? (languages.get(entry.anilistId) ?? []) : []))
      );
      const anchor = anime.get(row.anchorAnilistId);
      const all = (listed.get(row.id) ?? []).map(({ season }) => season);
      const seasons = all.filter((season) => season.kind === "season");
      return [
        row.id,
        {
          ...toSeriesCard(row, order.filter((language) => audio.has(language))),
          overview: row.overview ?? anchor?.description ?? null,
          score: anchor?.score ?? null,
          genres: anchor?.genres ?? [],
          seasonCount: seasons.length,
          episodeCount: seasons.reduce((total, season) => total + season.episodeCount, 0),
          startSeasonId: (all.find((season) => season.inWatchOrder) ?? all[0])?.id ?? null,
        }
      ];
    })
  );
}
