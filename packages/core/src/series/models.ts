import type { ContentLanguage } from "anime-sdk";

import type { AnimeStatus, AnimeTag, AnimeTrailer } from "../catalog/models/anime";
import type { SeasonKind } from "./seasons";
import type { SeriesKind } from "./series";

/**
 * A title for lists, grids, and search results.
 *
 * @remarks
 * Like every series model, this is a plain JSON-safe value and carries only
 * Sora's own IDs.
 */
export interface SeriesCard {
  /** Sora's series ID, such as `a_4kQ9vB2xLm0T`. */
  id: string;
  kind: SeriesKind;
  /** The title of the first season, or of the film. */
  title: string;
  /** TMDB's artwork for the whole title, or AniList's when TMDB has none. */
  posterUrl: string | null;
  backdropUrl: string | null;
  /** TMDB's English or textless logo, drawn over the backdrop. */
  logoUrl: string | null;
  /** Year of the first release. */
  year: number | null;
  /** Airing while any season airs; see `seriesStatus`. */
  status: AnimeStatus | null;
}

/**
 * Everything needed for a title's page.
 *
 * Details belong to the title, not to its seasons: synopsis and artwork come
 * from TMDB, and genres, tags, studios, and score from the first season.
 * Only the episodes differ between seasons; see `getSeasonEpisodes`.
 */
export interface Series extends SeriesCard {
  overview: string | null;
  genres: string[];
  tags: AnimeTag[];
  studios: string[];
  /** AniList's weighted score of the first season, 0–100. */
  score: number | null;
  trailer: AnimeTrailer | null;
  /** The next episode to air, or `null` when none is announced. */
  nextEpisode: {
    seasonId: string;
    /** Position within the season, from 1. */
    number: number;
    /** ISO 8601 timestamp. */
    airingAt: string;
  } | null;
  /** Regular seasons in order, then OVA seasons. A film has one. */
  seasons: Season[];
  /** Other titles from the franchise: films, spin-offs, and shorts. */
  related: SeriesCard[];
}

/** One season of a title, as listed in its season picker. */
export interface Season {
  /** Sora's season ID, such as `s_Zp81rTq0cW5e`. */
  id: string;
  kind: SeasonKind;
  /** Position among the title's seasons of the same kind, from 1. */
  number: number;
  /** TMDB's name for the season ("Mugen Train Arc") or "Season N"; for an OVA, what its title adds to the show's ("Visions of Coleus") or "OVA Season N". */
  title: string;
  episodeCount: number;
}

/** One episode of a season. */
export interface SeasonEpisode {
  /** Position within the season, from 1. */
  number: number;
  title: string | null;
  overview: string | null;
  /** `YYYY-MM-DD`. */
  airDate: string | null;
  runtimeMinutes: number | null;
  stillUrl: string | null;
  /**
   * The audio the episode can be watched with, dub before sub before raw, in
   * any locale. Empty when nothing streams it, and `null` only while its
   * providers have not been looked up yet.
   */
  audio: ContentLanguage[] | null;
  /**
   * Whether the episode is filler: story the manga does not have, made to let
   * the anime fall behind it. `false` when no provider says it is.
   */
  filler: boolean;
  /** An extra only TMDB lists, such as a recap special. No provider streams it. */
  extra: boolean;
}
