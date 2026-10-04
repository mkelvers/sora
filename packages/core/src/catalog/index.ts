/**
 * The anime catalog, backed by AniList.
 *
 * Inside the core, AniList IDs identify anime. Clients never see them: they
 * browse, open, and play titles through `series`, by Sora series and season
 * IDs. The catalog's public surface is what those clients still need
 * directly, the genre list and browse filters, plus the types series models
 * share.
 *
 * @packageDocumentation
 */
export type { AnimeStatus, AnimeTag } from "./models/anime";
export { BrowseQuerySchema, type BrowseQuery } from "./queries/browse-query";
export { currentSeason, getGenres, listSeasons, nextSeason, type Page } from "./queries/browse";
