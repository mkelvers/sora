import { eq } from "drizzle-orm";

import { db } from "../database/client";
import { series } from "../database/schema";
import { SeriesNotFoundError } from "../errors";
import { getImages, getSeasonPosters, getShow, tmdbImageUrl, type TmdbImage } from "../tmdb/resources";
import type { Series } from "./models";
import { getSeries } from "./queries";
import { parseKey, type SeriesKey } from "./series";

export type ImageType = "poster" | "backdrop" | "logo";

/** One image TMDB has for a title, to choose as its artwork with {@link setSeriesArtwork}. */
export interface SeriesImage {
  type: ImageType;
  /** The original size; swap `/original/` for a TMDB size bucket for a smaller file. */
  url: string;
  width: number;
  height: number;
  /** ISO 639-1 code of any text on the image; `null` when it has none. */
  language: string | null;
  voteAverage: number;
  voteCount: number;
  /** TMDB's number of the season a poster is for; `null` for the title's own. */
  seasonNumber: number | null;
}

/** How {@link listSeriesImages} filters and sorts. */
export interface SeriesImageQuery {
  /** Only these types; every type when omitted. */
  types?: readonly ImageType[];
  /** Only these languages, `null` meaning textless; every language when omitted. */
  languages?: readonly (string | null)[];
  /**
   * - `votes`: TMDB users' rating, the more votes the surer, then size.
   * - `quality`: the largest original first, then votes.
   *
   * @defaultValue "votes"
   */
  sort?: "votes" | "quality";
}

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

/**
 * Lists every backdrop, poster, and logo TMDB has for a series, in every
 * language, plus each season's posters for a show. Titles TMDB does not
 * list (standalone entries, shorts) have none.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 * @throws {@link UpstreamUnavailableError} when TMDB fails and nothing is cached.
 */
export async function listSeriesImages(seriesId: string, query: SeriesImageQuery = {}): Promise<SeriesImage[]> {
  const [row] = await db
    .select({
      key: series.key
    })
    .from(series)
    .where(eq(series.id, seriesId))
    .limit(1);
  if (!row) {
    throw new SeriesNotFoundError(seriesId);
  }

  const [kind, id] = parseKey(row.key as SeriesKey);
  if (kind !== "tv" && kind !== "movie") {
    return [];
  }

  const [own, seasons] = await Promise.all([
    getImages(kind, id),
    kind === "tv" ? seasonPostersOf(id) : []
  ]);

  // A season's poster is often the show's too; list it once, as the show's.
  const seen = new Set<string>();
  const images = [
    ...(own?.posters ?? []).map((image) => toSeriesImage("poster", image, null)),
    ...(own?.backdrops ?? []).map((image) => toSeriesImage("backdrop", image, null)),
    ...(own?.logos ?? []).map((image) => toSeriesImage("logo", image, null)),
    ...seasons
  ].filter((image) => {
    const key = `${image.type}:${image.url}`;
    return !seen.has(key) && seen.add(key);
  });

  return images
    .filter((image) => !query.types || query.types.includes(image.type))
    .filter((image) => !query.languages || query.languages.includes(image.language))
    .sort(query.sort === "quality" ? byQuality : byVotes);
}

/** Every season's posters, specials included. */
async function seasonPostersOf(showId: number): Promise<SeriesImage[]> {
  const show = await getShow(showId);
  const perSeason = await Promise.all(
    (show?.seasons ?? []).map(async ({ seasonNumber }) =>
      (await getSeasonPosters(showId, seasonNumber)).map((image) => toSeriesImage("poster", image, seasonNumber))
    )
  );
  return perSeason.flat();
}

function toSeriesImage(type: ImageType, image: TmdbImage, seasonNumber: number | null): SeriesImage {
  return {
    type,
    url: tmdbImageUrl(image.file_path, "original")!,
    width: image.width,
    height: image.height,
    language: image.iso_639_1,
    voteAverage: image.vote_average,
    voteCount: image.vote_count,
    seasonNumber
  };
}

/**
 * TMDB's rating, pulled toward 5 when few voted, so one 10 does not outrank
 * dozens of 8s; then the larger image.
 */
function byVotes(left: SeriesImage, right: SeriesImage) {
  return confidence(right) - confidence(left) || byArea(left, right);
}

function byQuality(left: SeriesImage, right: SeriesImage) {
  return byArea(left, right) || confidence(right) - confidence(left);
}

function byArea(left: SeriesImage, right: SeriesImage) {
  return right.width * right.height - left.width * left.height;
}

/** A Bayesian average: as if every image also had three votes of 5. */
function confidence(image: SeriesImage) {
  const priorVotes = 3;
  return (image.voteAverage * image.voteCount + 5 * priorVotes) / (image.voteCount + priorVotes);
}
