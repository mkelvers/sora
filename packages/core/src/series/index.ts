/**
 * Series: AniList entries grouped into Crunchyroll-style titles using TMDB.
 *
 * AniList lists every season, cour, film, and special as a separate entry;
 * TMDB and Crunchyroll present a franchise as one show with seasons, plus
 * separate titles for films and spin-offs. This module matches each AniList
 * entry to TMDB by air dates and groups the entries accordingly. AniList IDs
 * remain the canonical anime IDs, so a series' seasons plug straight into
 * playback, progress, and the watchlist.
 *
 * @packageDocumentation
 */
export {
  getEpisodeMetadata,
  getSeries,
  type EpisodeMetadata,
  type Series,
  type SeriesKey,
  type SeriesKind,
  type SeriesSeason,
  type SeriesSummary
} from "./series";
