/**
 * The anime catalog, backed by AniList.
 *
 * AniList IDs are the canonical anime IDs everywhere in the core.
 *
 * @packageDocumentation
 */
export type {
  AiringEpisode,
  Anime,
  AnimeCard,
  AnimeFormat,
  AnimeRelation,
  AnimeRelationType,
  AnimeSeason,
  AnimeSource,
  AnimeStatus,
  AnimeTag,
  AnimeTitle,
  AnimeTrailer
} from "./models/anime";
export { getAnime, getAnimeCards } from "./queries/anime";
export { BrowseQuerySchema, browseAnime, getGenres, type BrowseQuery, type Page } from "./queries/browse";
export { getAiringSchedule, type ScheduledEpisode } from "./queries/schedule";
