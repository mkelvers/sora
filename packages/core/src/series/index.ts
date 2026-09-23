/**
 * Series: AniList entries grouped into Crunchyroll-style titles using TMDB.
 *
 * AniList lists every season, cour, film, and special as a separate entry;
 * TMDB and Crunchyroll present a franchise as one show with seasons, plus
 * separate titles for films and spin-offs. This module matches each AniList
 * entry to TMDB by air dates and lays the entries out accordingly. AniList
 * IDs remain the canonical anime IDs: every episode carries the AniList
 * entry and episode number that playback, progress, and the watchlist use.
 *
 * @packageDocumentation
 */
export type { SeasonKind, SeriesEpisode, SeriesSeason } from "./seasons";
export { getSeries, type Series, type SeriesKey, type SeriesKind, type SeriesSummary } from "./series";
