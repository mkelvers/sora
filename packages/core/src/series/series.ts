import { toAnimeCard, type AnimeCard } from "../catalog/models/anime";
import { fuzzyDate } from "../catalog/models/text";
import { getAnime } from "../catalog/queries/anime";
import { AnimeNotFoundError } from "../errors";
import { getMovie, getShow, tmdbImageUrl, type TmdbShow } from "../tmdb/resources";
import { loadEntries, relatedIds, sequenceIds, type FranchiseEntry } from "./entries";
import { mappedEpisodes, resolveMapping, type TmdbMapping } from "./mapping";

/**
 * Identifies a series: a TMDB show (`tv:`), a TMDB film (`movie:`), or an
 * AniList entry that TMDB does not list (`anilist:`).
 */
export type SeriesKey = `tv:${number}` | `movie:${number}` | `anilist:${number}`;

/**
 * - `tv`: a TMDB show holding one or more AniList entries.
 * - `movie`: a film.
 * - `standalone`: an AniList entry TMDB does not list, shown on its own.
 */
export type SeriesKind = "tv" | "movie" | "standalone";

/** A series as shown in a list, such as a franchise's related titles. */
export interface SeriesSummary {
  key: SeriesKey;
  kind: SeriesKind;
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  /** First air or release date: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. */
  startDate: string | null;
  /**
   * AniList entries known to belong to the series. Passing any of them to
   * {@link getSeries} opens this series.
   */
  anilistIds: number[];
}

/**
 * One title in the Crunchyroll sense: a whole show with all of its seasons
 * and specials, a film, or a standalone entry.
 */
export interface Series extends SeriesSummary {
  overview: string | null;
  /**
   * The AniList entries that make up the series, as seasons: regular seasons
   * in broadcast order, then specials. A film or standalone entry has one.
   */
  seasons: SeriesSeason[];
  /** Other titles from the same franchise: films, spin-offs, and entries TMDB lists separately. */
  related: SeriesSummary[];
}

/** One AniList entry within a series. */
export interface SeriesSeason {
  /** The entry itself; its ID is what playback, progress, and the watchlist use. */
  anime: AnimeCard;
  /**
   * The TMDB season holding the entry's first episode: `0` for specials,
   * `null` for films and standalone entries. Several entries can share a
   * TMDB season, such as the two cours of a split season.
   */
  tmdbSeasonNumber: number | null;
}

/** TMDB's description of one episode, keyed by its AniList episode number. */
export interface EpisodeMetadata {
  /** AniList-canonical episode number, as used by playback and progress. */
  number: number;
  title: string | null;
  overview: string | null;
  /** `YYYY-MM-DD`. */
  airDate: string | null;
  runtimeMinutes: number | null;
  stillUrl: string | null;
  tmdbSeasonNumber: number;
  tmdbEpisodeNumber: number;
}

/**
 * Stops a franchise walk from wandering through sprawling franchises
 * (Gundam, Lupin) whose relation graphs span hundreds of entries.
 */
const franchiseEntryLimit = 150;

/** How many sequel or prequel steps the walk takes beyond the series' own entries. */
const outsiderHops = 2;

/** An AniList entry together with where it maps on TMDB. */
interface MappedEntry {
  entry: FranchiseEntry;
  mapping: TmdbMapping;
}

/**
 * Loads the series an anime belongs to, grouped the way Crunchyroll and TMDB
 * present it.
 *
 * AniList lists each season, cour, and special of a franchise as its own
 * entry. TMDB usually holds a whole franchise in one show. Every AniList
 * entry is matched to TMDB, and the entries that land in the same TMDB show
 * become that show's seasons. Films and spin-offs TMDB lists separately
 * become related series.
 *
 * The first request for a franchise walks its AniList relations and matches
 * each entry, which can take many upstream requests; matches are stored, so
 * later requests are fast.
 *
 * @throws {@link AnimeNotFoundError} when the ID is unknown to AniList or
 *   belongs to adult media.
 * @throws {@link UpstreamUnavailableError} when AniList or TMDB fail.
 *
 * @example
 * ```ts
 * // Tensura season 2 part 2 opens the whole show, with every season.
 * const series = await getSeries(116742);
 * series.seasons.map((season) => season.anime.id);
 * ```
 */
export async function getSeries(anilistId: number): Promise<Series> {
  const origin = await mapEntry(anilistId);
  const key = seriesKey(origin);
  const { members, outsiders } = await walkFranchise(origin, key);

  const related = new Map<SeriesKey, MappedEntry[]>();
  for (const outsider of outsiders) {
    const relatedKey = seriesKey(outsider);
    related.set(relatedKey, [
      ...(related.get(relatedKey) ?? []),
      outsider
    ]);
  }

  const relatedSummaries = await Promise.all([...related.values()].map((group) => summarize(group)));
  relatedSummaries.sort((left, right) => (left.startDate ?? "9999").localeCompare(right.startDate ?? "9999"));

  const orderedMembers = orderSeasons(members);
  return {
    ...(await summarize(orderedMembers)),
    overview: await overviewOf(orderedMembers),
    seasons: orderedMembers.map(({ entry, mapping }) => ({
      anime: toAnimeCard(entry),
      tmdbSeasonNumber: mapping.mediaType === "tv" ? mapping.seasonNumber : null
    })),
    related: relatedSummaries
  };
}

/**
 * Loads TMDB's episode titles, synopses, and stills for one AniList entry.
 *
 * Only episodes TMDB lists are returned; films and entries TMDB does not
 * list yield an empty list.
 *
 * @throws {@link AnimeNotFoundError} when the ID is unknown to AniList or
 *   belongs to adult media.
 * @throws {@link UpstreamUnavailableError} when AniList or TMDB fail.
 */
export async function getEpisodeMetadata(anilistId: number): Promise<EpisodeMetadata[]> {
  const { mapping } = await mapEntry(anilistId);
  if (mapping.mediaType !== "tv" || mapping.tmdbId === null) {
    return [];
  }

  const show = await getShow(mapping.tmdbId);
  if (!show) {
    return [];
  }

  const episodes = new Map(show.episodes.map((episode) => [`${episode.season_number}:${episode.episode_number}`, episode]));
  return mappedEpisodes(mapping).flatMap((link) => {
    const episode = episodes.get(`${link.seasonNumber}:${link.episodeNumber}`);
    return episode
      ? [
          {
            number: link.anilistEpisode,
            title: episode.name,
            overview: episode.overview,
            airDate: episode.air_date,
            runtimeMinutes: episode.runtime,
            stillUrl: tmdbImageUrl(episode.still_path, "w300"),
            tmdbSeasonNumber: link.seasonNumber,
            tmdbEpisodeNumber: link.episodeNumber
          }
        ]
      : [];
  });
}

async function mapEntry(anilistId: number): Promise<MappedEntry> {
  const entry = (await loadEntries([anilistId])).get(anilistId);
  if (!entry) {
    throw new AnimeNotFoundError(anilistId);
  }

  return {
    entry,
    mapping: await resolveMapping(entry)
  };
}

/**
 * Walks the franchise outward from `origin`, collecting the entries that
 * belong to series `key` and the neighbouring entries that do not.
 *
 * Members are expanded through every franchise relation. Other entries are
 * followed only along sequels and prequels, and at most
 * {@link outsiderHops} steps from the series, which finds film trilogies and
 * a season whose only link is a film without crossing the whole franchise.
 */
async function walkFranchise(origin: MappedEntry, key: SeriesKey) {
  const members: MappedEntry[] = [];
  const outsiders: MappedEntry[] = [];
  const visited = new Set([origin.entry.id]);
  let layer = [
    {
      ...origin,
      hops: 0
    }
  ];

  while (layer.length > 0) {
    const next = new Map<number, number>();
    for (const mapped of layer) {
      const isMember = seriesKey(mapped) === key;
      (isMember ? members : outsiders).push(mapped);

      const hops = isMember ? 0 : mapped.hops;
      if (hops >= outsiderHops) {
        continue;
      }

      for (const id of isMember ? relatedIds(mapped.entry) : sequenceIds(mapped.entry)) {
        if (!visited.has(id) && visited.size < franchiseEntryLimit) {
          visited.add(id);
          next.set(id, hops + 1);
        }
      }
    }

    const entries = await loadEntries(next.keys());
    layer = await Promise.all(
      [...entries.values()].map(async (entry) => ({
        entry,
        mapping: await resolveMapping(entry),
        hops: next.get(entry.id) ?? outsiderHops
      }))
    );
  }

  return {
    members,
    outsiders
  };
}

function seriesKey({ entry, mapping }: MappedEntry): SeriesKey {
  if (mapping.mediaType === "tv" && mapping.tmdbId !== null) {
    return `tv:${mapping.tmdbId}`;
  }

  if (mapping.mediaType === "movie" && mapping.tmdbId !== null) {
    return `movie:${mapping.tmdbId}`;
  }

  return `anilist:${entry.id}`;
}

/**
 * Orders a series' entries as seasons: regular seasons by their position on
 * TMDB, then specials, then anything else by start date.
 */
function orderSeasons(members: readonly MappedEntry[]) {
  const position = ({ mapping }: MappedEntry) => [
    mapping.seasonNumber === null ? 2 : mapping.seasonNumber === 0 ? 1 : 0,
    mapping.seasonNumber ?? 0,
    mapping.episodeNumber ?? 0
  ] as const;

  return [...members].sort((left, right) => {
    const [a, b] = [position(left), position(right)];
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || startDateOf(left.entry).localeCompare(startDateOf(right.entry));
  });
}

/**
 * Describes a group of entries sharing one series key. TMDB's title and
 * artwork are used when TMDB lists the series, AniList's otherwise.
 */
async function summarize(group: readonly MappedEntry[]): Promise<SeriesSummary> {
  const [first] = group;
  if (!first) {
    throw new TypeError("A series has at least one entry");
  }

  const key = seriesKey(first);
  const card = toAnimeCard(first.entry);
  const anilist = {
    key,
    kind: "standalone" as const,
    title: card.title.display,
    posterUrl: card.coverUrl,
    backdropUrl: card.bannerUrl,
    startDate: first.entry.startDate ? fuzzyDate(first.entry.startDate) : null,
    anilistIds: group.map(({ entry }) => entry.id)
  };

  const { mapping } = first;
  if (mapping.mediaType === "tv" && mapping.tmdbId !== null) {
    const show = await getShow(mapping.tmdbId);
    return show ? showSummary(show, anilist) : anilist;
  }

  if (mapping.mediaType === "movie" && mapping.tmdbId !== null) {
    const movie = await getMovie(mapping.tmdbId);
    return movie
      ? {
          ...anilist,
          kind: "movie",
          title: movie.title,
          posterUrl: tmdbImageUrl(movie.poster_path, "w780") ?? anilist.posterUrl,
          backdropUrl: tmdbImageUrl(movie.backdrop_path, "w1280") ?? anilist.backdropUrl,
          startDate: movie.release_date ?? anilist.startDate
        }
      : anilist;
  }

  return anilist;
}

function showSummary(show: TmdbShow, anilist: SeriesSummary): SeriesSummary {
  return {
    ...anilist,
    kind: "tv",
    title: show.name,
    posterUrl: tmdbImageUrl(show.posterPath, "w780") ?? anilist.posterUrl,
    backdropUrl: tmdbImageUrl(show.backdropPath, "w1280") ?? anilist.backdropUrl,
    startDate: show.firstAirDate ?? anilist.startDate
  };
}

/** TMDB's synopsis for the series, or AniList's for its first entry when TMDB has none. */
async function overviewOf(members: readonly MappedEntry[]) {
  const [first] = members;
  if (!first) {
    return null;
  }

  const { mapping } = first;
  let overview: string | null = null;
  if (mapping.mediaType === "tv" && mapping.tmdbId !== null) {
    overview = (await getShow(mapping.tmdbId))?.overview ?? null;
  } else if (mapping.mediaType === "movie" && mapping.tmdbId !== null) {
    overview = (await getMovie(mapping.tmdbId))?.overview ?? null;
  }

  return overview ?? (await getAnime(first.entry.id)).description;
}

function startDateOf(entry: FranchiseEntry) {
  return (entry.startDate ? fuzzyDate(entry.startDate) : null) ?? "9999";
}
