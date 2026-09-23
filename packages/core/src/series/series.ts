import { toAnimeCard, type AnimeCard } from "../catalog/models/anime";
import { fuzzyDate } from "../catalog/models/text";
import { getAnime } from "../catalog/queries/anime";
import { AnimeNotFoundError } from "../errors";
import { getMovie, getShow, tmdbImageUrl } from "../tmdb/resources";
import { loadEntries, primaryTitlesOf, relatedIds, sequenceIds, type FranchiseEntry } from "./entries";
import { mappedEpisodes, mappingsForShow, resolveMapping, type TmdbMapping } from "./mapping";
import { layoutShowSeasons, layoutStandaloneSeason, type SeasonMember, type SeriesSeason } from "./seasons";

/**
 * Identifies a series:
 *
 * - `tv:` a TMDB show;
 * - `shorts:` the short-form extras TMDB files under a show's specials, such
 *   as chibi shorts, split into a series of their own;
 * - `movie:` a TMDB film;
 * - `anilist:` an AniList entry that TMDB does not list.
 */
export type SeriesKey = `tv:${number}` | `shorts:${number}` | `movie:${number}` | `anilist:${number}`;

/**
 * - `tv`: a show with seasons, or a series of shorts.
 * - `movie`: a film.
 * - `standalone`: an AniList entry TMDB does not list, shown on its own.
 */
export type SeriesKind = "tv" | "movie" | "standalone";

/** A series as shown in a list, such as a franchise's related titles. */
export interface SeriesSummary {
  key: SeriesKey;
  kind: SeriesKind;
  /** The title of the series' first release, such as season 1's. */
  title: string;
  /** Artwork of the latest released entry, such as the newest season's cover. */
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
 * One title in the streaming-service sense: a whole show with all of its
 * seasons and OVAs, a film, or a standalone entry.
 */
export interface Series extends SeriesSummary {
  overview: string | null;
  /** Regular seasons in order, then OVA seasons. A film or standalone entry has one. */
  seasons: SeriesSeason[];
  /** Other titles from the same franchise: films, spin-offs, shorts, and entries TMDB lists separately. */
  related: SeriesSummary[];
}

/**
 * Entries shorter than this per episode, filed under a show's specials, are
 * shorts rather than OVAs: chibi theatres and two-minute web extras.
 */
const shortEpisodeMinutes = 10;

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
 * Loads the series an anime belongs to, laid out the way Crunchyroll and
 * TMDB present it.
 *
 * AniList lists each season, cour, film, and special of a franchise as its
 * own entry. Every entry is matched to TMDB, and the entries that land in
 * the same TMDB show become one series: later parts merge into the season
 * they continue, multi-episode OVAs become OVA seasons, and one-off specials
 * sit inside the seasons by air date. Films, spin-offs, and shorts become
 * related series. See `seasons.ts` for the layout rules.
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
 * // Tensura season 2 part 2 opens the whole show.
 * const series = await getSeries(116742);
 * series.seasons.map((season) => `${season.title}: ${season.episodes.length} episodes`);
 * ```
 */
export async function getSeries(anilistId: number): Promise<Series> {
  const entry = (await loadEntries([anilistId])).get(anilistId);
  if (!entry) {
    throw new AnimeNotFoundError(anilistId);
  }

  const origin = {
    entry,
    mapping: await resolveMapping(entry)
  };
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

  const seasons = await layoutSeasons(key, members, outsiders);
  const summary = summarize(key, members, seasons);
  return {
    ...summary,
    backdropUrl: (await tmdbBackdrop(key)) ?? summary.backdropUrl,
    overview: await overviewOf(key, members),
    seasons,
    related: [...related]
      .map(([relatedKey, group]) => summarize(relatedKey, group, []))
      .sort((left, right) => (left.startDate ?? "9999").localeCompare(right.startDate ?? "9999"))
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
    const isShort =
      entry.duration !== null &&
      entry.duration < shortEpisodeMinutes &&
      mappedEpisodes(mapping).every((link) => link.seasonNumber === 0);
    return isShort ? `shorts:${mapping.tmdbId}` : `tv:${mapping.tmdbId}`;
  }

  if (mapping.mediaType === "movie" && mapping.tmdbId !== null) {
    return `movie:${mapping.tmdbId}`;
  }

  return `anilist:${entry.id}`;
}

async function layoutSeasons(
  key: SeriesKey,
  members: readonly MappedEntry[],
  outsiders: readonly MappedEntry[]
): Promise<SeriesSeason[]> {
  const [kind, id] = parseKey(key);
  if (kind === "tv" || kind === "shorts") {
    const show = await getShow(id);
    if (show) {
      const memberIds = new Set(members.map(({ entry }) => entry.id));
      const others = (await mappingsForShow(id)).filter((mapping) => !memberIds.has(mapping.anilistId));
      return layoutShowSeasons({
        show,
        members: members.map(toSeasonMember),
        claimedSpecials: others.flatMap((mapping) => mappedEpisodes(mapping)),
        outsideEntries: outsiders
          .filter(({ mapping }) => mapping.mediaType !== "tv" || mapping.tmdbId !== id)
          .map(({ entry }) => ({
            titles: primaryTitlesOf(entry),
            startDate: startDateOf(entry),
            endDate: entry.endDate ? fuzzyDate(entry.endDate) : null,
            episodes: entry.episodes
          })),
        isShorts: kind === "shorts"
      });
    }
  }

  if (kind === "movie") {
    const movie = await getMovie(id);
    const anime = byStartDate(members).map(({ entry }) => toAnimeCard(entry));
    return [
      {
        kind: "movie",
        number: 1,
        title: anime[0]?.title.display ?? movie?.title ?? "Movie",
        posterUrl: anime.at(-1)?.coverUrl ?? tmdbImageUrl(movie?.poster_path ?? null, "w780"),
        anime,
        episodes: anime.map((card, index) => ({
          number: index + 1,
          title: index === 0 ? movie?.title ?? card.title.display : card.title.display,
          overview: index === 0 ? movie?.overview ?? null : null,
          airDate: index === 0 ? movie?.release_date ?? null : null,
          runtimeMinutes: index === 0 ? movie?.runtime ?? card.durationMinutes : card.durationMinutes,
          stillUrl: index === 0 ? tmdbImageUrl(movie?.backdrop_path ?? null, "w300") : null,
          playback: {
            anilistId: card.id,
            episode: 1
          },
          tmdb: null
        }))
      }
    ];
  }

  return byStartDate(members).map(({ entry }) => layoutStandaloneSeason(toAnimeCard(entry)));
}

function toSeasonMember({ entry, mapping }: MappedEntry): SeasonMember {
  return {
    anime: toAnimeCard(entry),
    prequelIds: (entry.relations?.edges ?? []).flatMap((edge) =>
      edge?.relationType === "PREQUEL" && edge.node?.type === "ANIME" ? [edge.node.id] : []
    ),
    links: mappedEpisodes(mapping)
  };
}

/**
 * Describes a series: named after its first release (season 1, not the
 * latest season) and illustrated with the artwork of its latest released
 * season. Specials and OVAs only provide artwork when the series has no
 * regular seasons.
 */
function summarize(key: SeriesKey, group: readonly MappedEntry[], seasons: readonly SeriesSeason[]): SeriesSummary {
  const chronological = byStartDate(group);
  const first = seasons.find((season) => season.kind === "season")?.anime[0] ?? cardOf(chronological[0]);
  const released = chronological.filter(({ entry }) => entry.status !== "NOT_YET_RELEASED");
  const releasedSeasons = released.filter(({ entry }) => isSeasonFormat(entry));
  const latest = cardOf(releasedSeasons.at(-1) ?? released.at(-1) ?? chronological.at(-1));
  const [kind] = parseKey(key);

  return {
    key,
    kind: kind === "movie" ? "movie" : kind === "anilist" ? "standalone" : "tv",
    title: first.title.display,
    posterUrl: latest.coverUrl ?? first.coverUrl,
    backdropUrl: latest.bannerUrl ?? first.bannerUrl,
    startDate: startDateOf(chronological[0]?.entry),
    anilistIds: chronological.map(({ entry }) => entry.id)
  };
}

async function tmdbBackdrop(key: SeriesKey) {
  const [kind, id] = parseKey(key);
  if (kind === "tv") {
    return tmdbImageUrl((await getShow(id))?.backdropPath ?? null, "w1280");
  }

  if (kind === "movie") {
    return tmdbImageUrl((await getMovie(id))?.backdrop_path ?? null, "w1280");
  }

  return null;
}

/** TMDB's synopsis for the series, or AniList's for its first entry when TMDB has none. */
async function overviewOf(key: SeriesKey, members: readonly MappedEntry[]) {
  const [kind, id] = parseKey(key);
  let overview: string | null = null;
  if (kind === "tv") {
    overview = (await getShow(id))?.overview ?? null;
  } else if (kind === "movie") {
    overview = (await getMovie(id))?.overview ?? null;
  }

  const [first] = byStartDate(members);
  return overview ?? (first ? (await getAnime(first.entry.id)).description : null);
}

/** Whether the entry is a season in its own right rather than a special, OVA, or film. */
function isSeasonFormat(entry: FranchiseEntry) {
  return entry.format === "TV" || entry.format === "TV_SHORT" || entry.format === "ONA";
}

function parseKey(key: SeriesKey) {
  const [kind, id] = key.split(":") as [
    "tv" | "shorts" | "movie" | "anilist",
    string
  ];
  return [kind, Number(id)] as const;
}

function byStartDate(group: readonly MappedEntry[]) {
  return [...group].sort((left, right) =>
    (startDateOf(left.entry) ?? "9999").localeCompare(startDateOf(right.entry) ?? "9999") || left.entry.id - right.entry.id
  );
}

function cardOf(mapped: MappedEntry | undefined): AnimeCard {
  if (!mapped) {
    throw new TypeError("A series has at least one entry");
  }

  return toAnimeCard(mapped.entry);
}

function startDateOf(entry: FranchiseEntry | undefined) {
  return entry?.startDate ? fuzzyDate(entry.startDate) : null;
}
