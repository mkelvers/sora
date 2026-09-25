/**
 * Pure rules that lay out a TMDB show's AniList entries as seasons.
 *
 * AniList splits a season into cours and parts; TMDB groups them into
 * seasons but files OVAs, recaps, and extras together under specials. The
 * layout here follows how a streaming service presents a show:
 *
 * - Regular seasons follow TMDB's seasons, with later parts and cours merged
 *   into the season they continue. Episodes are numbered from 1 in each
 *   season, never continuously across seasons.
 * - Multi-episode OVAs become OVA seasons of their own.
 * - One-off AniList specials are placed inside the regular seasons by air
 *   date, after the last episode that aired before them.
 * - Specials and extras that only TMDB lists are left out. No provider can
 *   stream them, and TMDB often lists them before, or without, any evidence
 *   that they aired; numbering them in would shift every later episode.
 */
import type { AnimeCard } from "../catalog/models/anime";
import type { TmdbEpisode, TmdbShow } from "../tmdb/resources";
import { tmdbImageUrl } from "../tmdb/resources";
import type { EpisodeLink } from "./matching";

/** One AniList entry of a show, with the TMDB episodes it was matched to. */
export interface SeasonMember {
  anime: AnimeCard;
  /** AniList IDs of the entry's direct prequels. */
  prequelIds: number[];
  links: EpisodeLink[];
  /**
   * A sequel season TMDB does not list yet. It is laid out as a regular
   * season after the listed ones, with AniList's episode numbers, until
   * TMDB catches up.
   */
  isUnlistedSeason?: boolean;
}

/**
 * - `season`: a regular season, possibly made of several AniList cours.
 * - `ova`: a multi-episode OVA or special series.
 * - `movie`: a film.
 */
export type SeasonKind = "season" | "ova" | "movie";

/** One season of a series, as a streaming service would list it. */
export interface SeriesSeason {
  kind: SeasonKind;
  /** Position among seasons of the same kind, from 1. */
  number: number;
  /** TMDB's name for the season when it has a real one ("Mugen Train Arc"), otherwise "Season N" or the entry's title. */
  title: string;
  /** The AniList entries whose episodes make up the season, in order. */
  anime: AnimeCard[];
  episodes: SeriesEpisode[];
}

/** One episode of a season. */
export interface SeriesEpisode {
  /** Position within the season, from 1. */
  number: number;
  title: string | null;
  overview: string | null;
  /** `YYYY-MM-DD`. */
  airDate: string | null;
  runtimeMinutes: number | null;
  stillUrl: string | null;
  /** The AniList entry and episode number to pass to playback and progress. */
  playback: {
    anilistId: number;
    episode: number;
  };
  /** The TMDB episode this is, when TMDB lists it. */
  tmdb: {
    seasonNumber: number;
    episodeNumber: number;
  } | null;
}

/** What {@link layoutShowSeasons} needs about the show. */
export interface ShowLayoutInput {
  show: Pick<TmdbShow, "episodes" | "seasons">;
  members: readonly SeasonMember[];
  /**
   * Lays out a series of shorts: every member becomes a season of its own
   * specials, and no one-off specials are placed.
   */
  isShorts?: boolean;
}

/** One episode slot before numbering. */
interface Row {
  member: SeasonMember;
  anilistEpisode: number;
  tmdb: TmdbEpisode | null;
  /** TMDB season the row counts towards; `0` when it has none. */
  seasonNumber: number;
}

interface Group {
  key: string;
  rows: Row[];
}

/**
 * Lays out a TMDB show's AniList entries as regular seasons followed by OVA
 * seasons. See the module documentation for the rules.
 */
export function layoutShowSeasons(input: ShowLayoutInput): SeriesSeason[] {
  const { show, members } = input;
  const episodes = new Map(show.episodes.map((episode, index) => [refKey(episode.season_number, episode.episode_number), {
    episode,
    index
  }]));
  // An entry is ordered by its regular episodes; an "episode 0" filed under
  // specials must not move a later season to the front.
  const position = (member: SeasonMember) => {
    const regularLinks = member.links.filter((link) => link.seasonNumber > 0);
    return Math.min(
      ...(regularLinks.length > 0 ? regularLinks : member.links).map(
        (link) => episodes.get(refKey(link.seasonNumber, link.episodeNumber))?.index ?? Infinity
      )
    );
  };

  const regular: SeasonMember[] = [];
  const ovas: SeasonMember[] = [];
  const oneOffs: SeasonMember[] = [];
  // Unlisted seasons have no position; AniList IDs grow with time, so they keep airing order.
  for (const member of [...members].sort((left, right) => position(left) - position(right) || left.anime.id - right.anime.id)) {
    const hasRegularEpisodes = member.links.some((link) => link.seasonNumber > 0);
    if (input.isShorts || hasRegularEpisodes || member.isUnlistedSeason) {
      regular.push(member);
    } else if (episodeCount(member) >= 2) {
      ovas.push(member);
    } else {
      oneOffs.push(member);
    }
  }

  const memberRows = regular.map((member) => rowsOf(member, episodes));
  const regularSeasons = new Set(memberRows.flat().map((row) => row.seasonNumber).filter((season) => season > 0));
  const followsTmdbSeasons = !input.isShorts && regularSeasons.size > 1;

  const groups = mergeLaterParts(
    groupRows(memberRows, (row) =>
      followsTmdbSeasons && row.seasonNumber > 0 ? `season:${row.seasonNumber}` : `anime:${row.member.anime.id}`
    )
  );

  if (!input.isShorts) {
    placeOneOffs(groups, oneOffRows(oneOffs, episodes));
  }

  const ovaGroups = mergeLaterParts(ovas.map((member) => ({
    key: `anime:${member.anime.id}`,
    rows: rowsOf(member, episodes)
  })));

  return [
    ...groups.map((group, index) => toSeason(group, "season", index + 1, followsTmdbSeasons ? show.seasons : [])),
    ...ovaGroups.map((group, index) => ({
      ...toSeason(group, "ova", index + 1, []),
      title: ovaSeasonTitle(group.rows[0]?.member?.anime, regular[0]?.anime, index + 1)
    }))
  ];
}

/**
 * Lays out a single AniList entry that TMDB does not list as one season,
 * with AniList's episode numbers and no episode metadata.
 *
 * @param number - The season's position in its series, from 1; an entry
 *   TMDB does not list can still have sequels that TMDB does not list either.
 */
export function layoutStandaloneSeason(anime: AnimeCard, number: number): SeriesSeason {
  const count = anime.episodes ?? (anime.nextEpisode ? anime.nextEpisode.number - 1 : 1);
  return {
    kind: anime.format === "MOVIE" ? "movie" : "season",
    number,
    title: anime.title.display,
    anime: [anime],
    episodes: Array.from({ length: Math.max(count, 1) }, (_, index) => ({
      number: index + 1,
      title: null,
      overview: null,
      airDate: null,
      runtimeMinutes: anime.durationMinutes,
      stillUrl: null,
      playback: {
        anilistId: anime.id,
        episode: index + 1
      },
      tmdb: null
    }))
  };
}

/**
 * The entry's episodes in AniList order, including ones TMDB does not list.
 * Each counts towards the TMDB season of its nearest listed neighbour, so an
 * "episode 0" filed under specials stays with the season it opens.
 */
function rowsOf(member: SeasonMember, episodes: ReadonlyMap<string, { episode: TmdbEpisode }>): Row[] {
  const links = new Map(member.links.map((link) => [link.anilistEpisode, link]));
  const count = Math.max(episodeCount(member), ...member.links.map((link) => link.anilistEpisode));

  const rows: Row[] = Array.from({ length: count }, (_, index) => {
    const link = links.get(index + 1);
    return {
      member,
      anilistEpisode: index + 1,
      tmdb: link ? episodes.get(refKey(link.seasonNumber, link.episodeNumber))?.episode ?? null : null,
      seasonNumber: link?.seasonNumber ?? 0
    };
  });

  // Rows without a regular season borrow the next one, then the previous one.
  let following = 0;
  for (const row of [...rows].reverse()) {
    following = row.seasonNumber > 0 ? row.seasonNumber : following;
    row.seasonNumber ||= following;
  }

  let preceding = 0;
  for (const row of rows) {
    preceding = row.seasonNumber > 0 ? row.seasonNumber : preceding;
    row.seasonNumber ||= preceding;
  }

  return rows;
}

/** Splits consecutive rows into groups wherever `keyOf` changes. */
function groupRows(memberRows: readonly Row[][], keyOf: (row: Row) => string): Group[] {
  const groups: Group[] = [];
  for (const row of memberRows.flat()) {
    const key = keyOf(row);
    const current = groups.at(-1);
    if (current?.key === key) {
      current.rows.push(row);
    } else {
      groups.push({
        key,
        rows: [row]
      });
    }
  }

  return groups;
}

/**
 * Folds a group into the one before it when it opens with a later part or
 * cour ("Season 2 Part 2", "Cour 2") of an entry in that group.
 */
function mergeLaterParts(groups: readonly Group[]): Group[] {
  const merged: Group[] = [];
  for (const group of groups) {
    const previous = merged.at(-1);
    const opener = group.rows[0]?.member;
    const continuesPrevious =
      previous !== undefined &&
      opener !== undefined &&
      isLaterPart(opener.anime) &&
      previous.rows.some((row) => opener.prequelIds.includes(row.member.anime.id));

    if (previous && continuesPrevious) {
      previous.rows.push(...group.rows);
    } else {
      merged.push({
        key: group.key,
        rows: [...group.rows]
      });
    }
  }

  return merged;
}

/**
 * Whether a title names the second or later part of a season, such as
 * "Season 2 Part 2", "Cour 2", "2nd Cour", or "第2クール".
 */
export function isLaterPart(anime: AnimeCard) {
  return [
    anime.title.english,
    anime.title.romaji,
    anime.title.native
  ].some((title) =>
    title !== null &&
    (/\b(?:part|cour)\s*(?:[2-9]|ii|iii|iv|two|three|four)\b/i.test(title) ||
      /\b(?:2nd|3rd|[4-9]th|second|third|fourth)\s+(?:part|cour)\b/i.test(title) ||
      /第\s*[2-9二三四]\s*(?:クール|部)/.test(title))
  );
}

/** The episodes of one-off AniList specials, in air-date order; undated ones last. */
function oneOffRows(oneOffs: readonly SeasonMember[], episodes: ReadonlyMap<string, { episode: TmdbEpisode }>): Row[] {
  return oneOffs
    .flatMap((member) => rowsOf(member, episodes))
    .sort((left, right) =>
      (left.tmdb?.air_date ?? "9999").localeCompare(right.tmdb?.air_date ?? "9999") ||
      (left.tmdb?.episode_number ?? 0) - (right.tmdb?.episode_number ?? 0)
    );
}

/**
 * Inserts each one-off special after the last regular episode that aired on
 * or before it. Specials older than every episode open the first season;
 * specials without a date close the last.
 */
function placeOneOffs(groups: Group[], oneOffs: readonly Row[]) {
  if (groups.length === 0) {
    if (oneOffs.length > 0) {
      groups.push({
        key: "one-offs",
        rows: [...oneOffs]
      });
    }

    return;
  }

  for (const oneOff of oneOffs) {
    const airDate = oneOff.tmdb?.air_date ?? null;
    if (airDate === null) {
      groups.at(-1)?.rows.push(oneOff);
      continue;
    }

    let targetGroup: Group | null = null;
    let targetIndex = -1;
    for (const group of groups) {
      for (const [index, row] of group.rows.entries()) {
        const rowDate = row.tmdb?.air_date ?? null;
        if (rowDate !== null && rowDate <= airDate) {
          targetGroup = group;
          targetIndex = index;
        }
      }
    }

    if (targetGroup) {
      targetGroup.rows.splice(targetIndex + 1, 0, oneOff);
    } else {
      groups[0]?.rows.unshift(oneOff);
    }
  }
}

/** OVA names that say nothing beyond "this is an OVA". */
const genericOvaName = /^(?:the\s+)?(?:ova|oad|ona|special|specials|extra|extras|bonus)(?:\s*\d+)?$/i;

/**
 * Names an OVA season by what sets it apart from its show, the way "Season
 * N" names a regular season: "That Time I Got Reincarnated as a Slime:
 * Visions of Coleus" becomes "Visions of Coleus". When the show's title
 * leaves nothing distinctive ("OAD", "Specials"), the season is "OVA Season N".
 * An OVA whose title does not start with the show's keeps its own title.
 *
 * @param ova - The season's first AniList entry.
 * @param show - The show's first regular entry, whose titles are removed.
 */
export function ovaSeasonTitle(ova: AnimeCard | undefined, show: AnimeCard | undefined, number: number) {
  const fallback = `OVA Season ${number}`;
  if (!ova) {
    return fallback;
  }

  const showTitles = [
    show?.title.english,
    show?.title.romaji,
    show?.title.native
  ].filter((title): title is string => Boolean(title));

  for (const title of [
    ova.title.display,
    ova.title.english,
    ova.title.romaji,
    ova.title.native
  ]) {
    const prefix = title ? showTitles.find((showTitle) => title.toLowerCase().startsWith(showTitle.toLowerCase())) : undefined;
    if (title && prefix) {
      const rest = title.slice(prefix.length).replace(/^[\s:：\-–—~!！.]+/, "").trim();
      return rest.length === 0 || genericOvaName.test(rest) ? fallback : rest;
    }
  }

  return genericOvaName.test(ova.title.display) ? fallback : ova.title.display;
}

function toSeason(group: Group, kind: SeasonKind, number: number, tmdbSeasons: TmdbShow["seasons"]): SeriesSeason {
  const anime = [...new Map(group.rows.map((row) => [row.member.anime.id, row.member.anime] as const)).values()];
  const tmdbSeasonNumbers = new Set(group.rows.map((row) => row.seasonNumber));
  const [onlySeason] = tmdbSeasonNumbers.size === 1 ? [...tmdbSeasonNumbers] : [];
  const tmdbSeason = onlySeason ? tmdbSeasons.find((season) => season.seasonNumber === onlySeason) : undefined;
  const tmdbName = tmdbSeason?.name && !/^(?:season|series|part)\s*\d+$|^specials$/i.test(tmdbSeason.name) ? tmdbSeason.name : null;

  return {
    kind,
    number,
    title: kind === "season" ? tmdbName ?? `Season ${number}` : anime[0]?.title.display ?? `OVA Season ${number}`,
    anime,
    episodes: group.rows.map((row, index) => ({
      number: index + 1,
      title: row.tmdb?.name ?? null,
      overview: row.tmdb?.overview ?? null,
      airDate: row.tmdb?.air_date ?? null,
      runtimeMinutes: row.tmdb?.runtime ?? row.member.anime.durationMinutes,
      stillUrl: tmdbImageUrl(row.tmdb?.still_path ?? null, "w300"),
      playback: {
        anilistId: row.member.anime.id,
        episode: row.anilistEpisode
      },
      tmdb: row.tmdb
        ? {
            seasonNumber: row.tmdb.season_number,
            episodeNumber: row.tmdb.episode_number
          }
        : null
    }))
  };
}

/** The entry's known episode count: AniList's total, or its aired episodes while airing. */
function episodeCount(member: SeasonMember) {
  return member.anime.episodes ?? (member.anime.nextEpisode ? member.anime.nextEpisode.number - 1 : member.links.length);
}

function refKey(seasonNumber: number, episodeNumber: number) {
  return `${seasonNumber}:${episodeNumber}`;
}
