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
 */
export { logoPlacement } from "../models/series";

export { type SeriesImageQuery, artwork } from "./artwork";

export { listStudios, listTags } from "./categories";

export type { ImageEdges } from "./edges";

export { upscales } from "./upscale";

export { getUpscaledBackdrop } from "./upscaled-backdrop";

export { ReleasesQuerySchema, type ReleasesQuery, titles } from "./queries";

export { similar } from "./similar";

export { schedule } from "./schedule";

export type { SeriesKind } from "./series";

export { upcoming } from "./upcoming";
