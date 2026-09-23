import { toAnimeCard, type AnimeCard } from "../catalog/models/anime";
import { fuzzyDate } from "../catalog/models/text";
import { getAnime, getStoredAnimeCards } from "../catalog/queries/anime";
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
  /**
   * TMDB's artwork for a full series. In a summary, and for a series TMDB
   * does not list, the artwork of the latest released entry.
   */
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
  /**
   * The first AniList entry of the first season, or of the first release
   * when there are no regular seasons. The stored series is tied to it.
   */
  anchorAnilistId: number;
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

/** An AniList entry together with where it maps on TMDB and the series it belongs to. */
interface MappedEntry {
  entry: FranchiseEntry;
  mapping: TmdbMapping;
  key: SeriesKey;
  /** The stored catalog card when there is one, since the airing scheduler keeps it current. */
  card: AnimeCard;
}

/**
 * Lays out the series an anime belongs to, the way Crunchyroll and TMDB
 * present it.
 *
 * AniList lists each season, cour, film, and special of a franchise as its
 * own entry. Every entry is matched to TMDB, and the entries that land in
 * the same TMDB show become one series: later parts merge into the season
 * they continue, multi-episode OVAs become OVA seasons, and one-off specials
 * sit inside the seasons by air date. A sequel season TMDB does not list yet
 * joins its prequel's series. Films, spin-offs, and shorts become related
 * series. See `seasons.ts` for the layout rules.
 *
 * This walks the franchise's AniList relations and matches each new entry,
 * which can take many upstream requests, so only the series store calls it;
 * readers use the stored layout. Matches are stored, so laying out a known
 * franchise again mostly reuses them.
 *
 * @throws {@link AnimeNotFoundError} when the ID is unknown to AniList or
 *   belongs to adult media.
 * @throws {@link UpstreamUnavailableError} when AniList or TMDB fail.
 */
export async function buildSeries(anilistId: number): Promise<Series> {
  const entry = (await loadEntries([anilistId])).get(anilistId);
  if (!entry) {
    throw new AnimeNotFoundError(anilistId);
  }

  const [origin] = await mapEntries([entry]);
  if (!origin) {
    throw new TypeError("Mapping one entry yields one mapped entry");
  }

  const { members, outsiders } = await walkFranchise(origin);

  const related = new Map<SeriesKey, MappedEntry[]>();
  for (const outsider of outsiders) {
    related.set(outsider.key, [
      ...(related.get(outsider.key) ?? []),
      outsider
    ]);
  }

  const seasons = await layoutSeasons(origin.key, members, outsiders);
  const summary = summarize(origin.key, members, seasons);
  const artwork = await tmdbArtwork(origin.key);
  return {
    ...summary,
    posterUrl: artwork.posterUrl ?? summary.posterUrl,
    backdropUrl: artwork.backdropUrl ?? summary.backdropUrl,
    overview: await overviewOf(origin.key, members),
    seasons,
    related: [...related]
      .map(([relatedKey, group]) => summarize(relatedKey, group, []))
      .sort((left, right) => (left.startDate ?? "9999").localeCompare(right.startDate ?? "9999")),
    anchorAnilistId: anchorOf(seasons, members)
  };
}

/**
 * Walks the franchise outward from `origin`, collecting the entries that
 * belong to its series and the neighbouring entries that do not.
 *
 * Members are expanded through every franchise relation. Other entries are
 * followed only along sequels and prequels, and at most
 * {@link outsiderHops} steps from the series, which finds film trilogies and
 * a season whose only link is a film without crossing the whole franchise.
 */
async function walkFranchise(origin: MappedEntry) {
  const members: MappedEntry[] = [];
  const outsiders: MappedEntry[] = [];
  const visited = new Set([origin.entry.id]);
  let layer = [
    {
      mapped: origin,
      hops: 0
    }
  ];

  while (layer.length > 0) {
    const next = new Map<number, number>();
    for (const { mapped, hops: previousHops } of layer) {
      const isMember = mapped.key === origin.key;
      (isMember ? members : outsiders).push(mapped);

      const hops = isMember ? 0 : previousHops;
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

    const mapped = await mapEntries([...(await loadEntries(next.keys())).values()]);
    layer = mapped.map((item) => ({
      mapped: item,
      hops: next.get(item.entry.id) ?? outsiderHops
    }));
  }

  return {
    members,
    outsiders
  };
}

/** Resolves each entry's TMDB mapping and series, and picks its freshest card. */
async function mapEntries(entries: readonly FranchiseEntry[]): Promise<MappedEntry[]> {
  const stored = await getStoredAnimeCards(entries.map((entry) => entry.id));
  return Promise.all(
    entries.map(async (entry) => {
      const mapping = await resolveMapping(entry);
      return {
        entry,
        mapping,
        key: await seriesKeyOf(entry, mapping, new Set()),
        card: stored.get(entry.id) ?? toAnimeCard(entry)
      };
    })
  );
}

/**
 * The series an entry belongs to.
 *
 * A sequel season that TMDB does not list yet, which is common for a season
 * that was just announced, joins the series of its prequel rather than
 * becoming a title of its own. It stays there once TMDB lists it, so its
 * season keeps its ID.
 *
 * @param visited - Entries already followed, which stops prequel cycles.
 */
async function seriesKeyOf(entry: FranchiseEntry, mapping: TmdbMapping, visited: ReadonlySet<number>): Promise<SeriesKey> {
  const own = ownSeriesKey(entry, mapping);
  const [prequelId] = prequelIdsOf(entry);
  if (mapping.tmdbId !== null || !isSeasonFormat(entry) || prequelId === undefined || visited.has(prequelId)) {
    return own;
  }

  const prequel = (await loadEntries([prequelId])).get(prequelId);
  if (!prequel) {
    return own;
  }

  const inherited = await seriesKeyOf(prequel, await resolveMapping(prequel), new Set([
    ...visited,
    entry.id
  ]));
  // A season that follows a film is its own show, not part of the film.
  return inherited.startsWith("movie:") ? own : inherited;
}

/** The series an entry's own TMDB mapping puts it in. */
function ownSeriesKey(entry: FranchiseEntry, mapping: TmdbMapping): SeriesKey {
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
    const anime = byStartDate(members).map(({ card }) => card);
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

  return byStartDate(members).map(({ card }, index) => layoutStandaloneSeason(card, index + 1));
}

function toSeasonMember({ entry, mapping, card }: MappedEntry): SeasonMember {
  return {
    anime: card,
    prequelIds: prequelIdsOf(entry),
    links: mappedEpisodes(mapping),
    isUnlistedSeason: mapping.tmdbId === null
  };
}

function prequelIdsOf(entry: FranchiseEntry) {
  return (entry.relations?.edges ?? []).flatMap((edge) =>
    edge?.relationType === "PREQUEL" && edge.node?.type === "ANIME" ? [edge.node.id] : []
  );
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

/** See {@link Series.anchorAnilistId}. */
function anchorOf(seasons: readonly SeriesSeason[], members: readonly MappedEntry[]) {
  const firstSeason = seasons.find((season) => season.kind === "season") ?? seasons[0];
  return firstSeason?.anime[0]?.id ?? cardOf(byStartDate(members)[0]).id;
}

/** TMDB's poster and backdrop for a show or film. Shorts use their own entries' artwork. */
async function tmdbArtwork(key: SeriesKey) {
  const [kind, id] = parseKey(key);
  if (kind === "tv") {
    const show = await getShow(id);
    return {
      posterUrl: tmdbImageUrl(show?.posterPath ?? null, "w780"),
      backdropUrl: tmdbImageUrl(show?.backdropPath ?? null, "w1280")
    };
  }

  if (kind === "movie") {
    const movie = await getMovie(id);
    return {
      posterUrl: tmdbImageUrl(movie?.poster_path ?? null, "w780"),
      backdropUrl: tmdbImageUrl(movie?.backdrop_path ?? null, "w1280")
    };
  }

  return {
    posterUrl: null,
    backdropUrl: null
  };
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

  return mapped.card;
}

function startDateOf(entry: FranchiseEntry | undefined) {
  return entry?.startDate ? fuzzyDate(entry.startDate) : null;
}
