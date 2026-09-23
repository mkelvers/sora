/**
 * Series: AniList entries grouped into Crunchyroll-style titles using TMDB.
 *
 * AniList lists every season, cour, film, and special as a separate entry;
 * TMDB and Crunchyroll present a franchise as one show with seasons, plus
 * separate titles for films and spin-offs. This module matches each AniList
 * entry to TMDB by air dates, lays the entries out accordingly, and stores
 * the result under Sora's own series and season IDs, the only IDs clients
 * see. A series is laid out when first found; after that the scheduler
 * keeps it current as its seasons air and new ones are announced.
 *
 * @packageDocumentation
 */
export type { Season, SeasonEpisode, Series, SeriesCard } from "./models";
export { browseSeries, getSeasonEpisodes, getSeries } from "./queries";
export type { SeasonKind } from "./seasons";
export type { SeriesKind } from "./series";
export { resolveSeries } from "./store";
