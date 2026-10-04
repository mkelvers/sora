/**
 * Series: AniList's entries as the titles clients see.
 *
 * AniList lists every season, cour, film, and special as a separate entry,
 * and each is a series of its own, with the episodes AniList counts for it.
 * An entry is matched to TMDB for its backdrop, logo, and episode details,
 * and stored under Sora's own series ID, the only ID clients see. A series
 * is laid out when first found; after that the scheduler keeps it current
 * as it airs. The titles of a franchise are found from one another as
 * AniList relates them.
 *
 * @packageDocumentation
 */
export {
	listSeriesImages,
	logoPlacement,
	refreshSeriesImages,
	setSeriesArtwork,
	type ArtworkChanges,
	type ImageType,
	type SeriesImage,
	type SeriesImageQuery,
} from "./artwork";
export type { ImageEdges } from "./edges";
export type { FranchisePart } from "./franchise";
export type { Episode, PreparingTitle, Release, Series, SeriesCard } from "./models";
export {
	browseSeries,
	getAdjacentEpisodes,
	getLatestReleases,
	getSeries,
	getSeriesEpisodes,
	ReleasesQuerySchema,
	type ReleasesQuery,
} from "./queries";
export { getAiringSchedule, type ScheduledEpisode } from "./schedule";
export type { SeriesKind } from "./series";
export { getUpcomingSeries, type UpcomingSeries } from "./upcoming";
