import { eq } from "drizzle-orm";

import { db } from "../database/client";
import { series } from "../database/schema";
import { SeriesNotFoundError } from "../errors";
import type { Series } from "./models";
import { getSeries } from "./queries";

/**
 * Artwork to choose for a series. A URL replaces the laid-out image, `null`
 * goes back to it, and an omitted field is left as it is.
 */
export interface ArtworkChanges {
  posterUrl?: string | null;
  backdropUrl?: string | null;
  logoUrl?: string | null;
}

/**
 * Chooses a series' poster, backdrop, or logo for everyone, in place of the
 * one laid out from TMDB or AniList. The choice outlives laying the series
 * out again. Returns the series as {@link getSeries} loads it.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function setSeriesArtwork(seriesId: string, changes: ArtworkChanges): Promise<Series> {
  const values = {
    posterUrlOverride: changes.posterUrl,
    backdropUrlOverride: changes.backdropUrl,
    logoUrlOverride: changes.logoUrl
  };

  // Drizzle skips undefined fields, and refuses an update with none left.
  if (Object.values(values).some((value) => value !== undefined)) {
    const updated = await db
      .update(series)
      .set(values)
      .where(eq(series.id, seriesId))
      .returning({
        id: series.id
      });
    if (updated.length === 0) {
      throw new SeriesNotFoundError(seriesId);
    }
  }

  return getSeries(seriesId);
}
