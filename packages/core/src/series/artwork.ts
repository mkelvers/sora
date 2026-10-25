import { day, defined } from "@sora/shared";
import { eq } from "drizzle-orm";

import { db } from "../database/client";
import { noArtwork, series, titleArtwork, titleImage } from "../database/schema";
import { SeriesNotFoundError } from "../errors";
import type { ArtworkChanges, ImageType, Series, SeriesImage } from "../models/series";
import { getImages, getSeasonPosters, getShow, tmdbImageUrl } from "../tmdb/resources";
import type { TmdbImage } from "../tmdb/resources";
import { storeBackdropEdges } from "./edges";
import { getSeries } from "./queries";
import { parseKey } from "./series";
import type { SeriesKey } from "./series";

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

/** Stores `false`, no artwork, as {@link noArtwork}. */
/** An image as stored, before {@link applyQuery} names its language. */
type StoredImage = Omit<SeriesImage, "language_name">;

const languageNames = new Intl.DisplayNames(["en"], {
	type: "language",
});

/** The TMDB size an image is saved in once chosen: the largest one it is shown at. */
const savedSizes = {
	backdrop: "original",
	logo: "w500",
	poster: "w780",
} as const;

const toOverride = (change: string | false | null | undefined, type: ImageType) =>
	change === false ? noArtwork : change?.replace("/original/", `/${savedSizes[type]}/`);

/**
 * Chooses a series' poster, backdrop, or logo for everyone, in place of the
 * one laid out from TMDB or AniList. The poster is the series' own, since
 * it tells one season from another; the backdrop, logo, and logo placement
 * are chosen for the TMDB title, so every series laid out from it shows
 * them (see `titleArtwork`). The choice outlives laying the series out
 * again. Returns the series as {@link getSeries} loads it.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export const setSeriesArtwork = async (
	seriesId: string,
	changes: ArtworkChanges,
): Promise<Series> => {
	const [row] = await db
		.select({
			key: series.key,
		})
		.from(series)
		.where(eq(series.id, seriesId))
		.limit(1);
	if (!row) {
		throw new SeriesNotFoundError(seriesId);
	}

	const poster = toOverride(changes.poster_url, "poster");
	const title = {
		backdropUrlOverride: toOverride(changes.backdrop_url, "backdrop"),
		logoOffsetX: changes.logo_offset_x,
		logoOffsetY: changes.logo_offset_y,
		logoScale: changes.logo_scale,
		logoUrlOverride: toOverride(changes.logo_url, "logo"),
	};

	await db.transaction(async (tx) => {
		if (poster !== undefined) {
			await tx
				.update(series)
				.set({
					posterUrlOverride: poster,
				})
				.where(eq(series.id, seriesId));
		}

		// Drizzle skips undefined fields, and refuses an update with none left.
		if (Object.values(title).some((value) => value !== undefined)) {
			await tx
				.insert(titleArtwork)
				.values({
					key: row.key,
					...title,
				})
				.onConflictDoUpdate({
					set: title,
					target: titleArtwork.key,
				});
		}
	});

	if (title.backdropUrlOverride !== undefined) {
		await storeBackdropEdges(seriesId);
	}

	return getSeries(seriesId);
};

const imageStateOf = async (seriesId: string) => {
	const [row] = await db
		.select({
			imagesFetchedAt: titleArtwork.imagesFetchedAt,
			key: series.key,
		})
		.from(series)
		.leftJoin(titleArtwork, eq(titleArtwork.key, series.key))
		.where(eq(series.id, seriesId))
		.limit(1);
	if (!row) {
		throw new SeriesNotFoundError(seriesId);
	}

	return row;
};

const storedImagesOf = async (key: string): Promise<StoredImage[]> =>
	db
		.select({
			height: titleImage.height,
			language: titleImage.language,
			season_number: titleImage.seasonNumber,
			type: titleImage.type,
			url: titleImage.url,
			vote_average: titleImage.voteAverage,
			vote_count: titleImage.voteCount,
			width: titleImage.width,
		})
		.from(titleImage)
		.where(eq(titleImage.key, key));

const toStoredImage = (
	type: ImageType,
	image: TmdbImage,
	seasonNumber: number | null,
): StoredImage => ({
	height: image.height,
	language: image.iso_639_1,
	season_number: seasonNumber,
	type,
	url: defined(tmdbImageUrl(image.file_path, "original")),
	vote_average: image.vote_average,
	vote_count: image.vote_count,
	width: image.width,
});

/** Every season's posters, specials included. */
const seasonPostersOf = async (showId: number, maxAgeMs: number): Promise<StoredImage[]> => {
	// A refresh also finds seasons added since; otherwise the show's usual lifetime will do.
	const show = await getShow(showId, maxAgeMs === 0 ? { maxAgeMs } : {});
	const perSeason = await Promise.all(
		(show?.seasons ?? []).map(async ({ seasonNumber }) =>
			(
				await getSeasonPosters(showId, seasonNumber, {
					maxAgeMs,
				})
			).map((image) => toStoredImage("poster", image, seasonNumber)),
		),
	);
	return perSeason.flat();
};

const fetchImages = async (key: SeriesKey, maxAgeMs: number): Promise<StoredImage[]> => {
	const [kind, id] = parseKey(key);
	if (kind !== "tv" && kind !== "movie") {
		return [];
	}

	const [own, seasons] = await Promise.all([
		getImages(kind, id, {
			maxAgeMs,
		}),
		kind === "tv" ? seasonPostersOf(id, maxAgeMs) : [],
	]);

	// A season's poster is often the show's too; list it once, as the show's.
	const seen = new Set<string>();
	return [
		...(own?.posters ?? []).map((image) => toStoredImage("poster", image, null)),
		...(own?.backdrops ?? []).map((image) => toStoredImage("backdrop", image, null)),
		...(own?.logos ?? []).map((image) => toStoredImage("logo", image, null)),
		...seasons,
	].filter((image) => {
		const key = `${image.type}:${image.url}`;
		return !seen.has(key) && seen.add(key);
	});
};

/** Fetches a title's images from TMDB, no older than `maxAgeMs`, and stores them in place of the old. */
const storeImages = async (key: SeriesKey, maxAgeMs: number): Promise<StoredImage[]> => {
	const images = await fetchImages(key, maxAgeMs);

	await db.transaction(async (tx) => {
		await tx
			.insert(titleArtwork)
			.values({
				imagesFetchedAt: new Date(),
				key,
			})
			.onConflictDoUpdate({
				set: {
					imagesFetchedAt: new Date(),
				},
				target: titleArtwork.key,
			});
		await tx.delete(titleImage).where(eq(titleImage.key, key));
		if (images.length > 0) {
			await tx
				.insert(titleImage)
				.values(
					images.map((image) => ({
						height: image.height,
						key,
						language: image.language,
						seasonNumber: image.season_number,
						type: image.type,
						url: image.url,
						voteAverage: image.vote_average,
						voteCount: image.vote_count,
						width: image.width,
					})),
				)
				.onConflictDoNothing();
		}
	});

	return images;
};

const byArea = (left: StoredImage, right: StoredImage) =>
	right.width * right.height - left.width * left.height;

/** A Bayesian average: as if every image also had three votes of 5. */
const confidence = (image: StoredImage) => {
	const priorVotes = 3;
	return (image.vote_average * image.vote_count + 5 * priorVotes) / (image.vote_count + priorVotes);
};

const byQuality = (left: StoredImage, right: StoredImage) =>
	byArea(left, right) || confidence(right) - confidence(left);

/**
 * TMDB's rating, pulled toward 5 when few voted, so one 10 does not outrank
 * dozens of 8s; then the larger image.
 */
const byVotes = (left: StoredImage, right: StoredImage) =>
	confidence(right) - confidence(left) || byArea(left, right);

const applyQuery = (images: StoredImage[], query: SeriesImageQuery): SeriesImage[] =>
	images
		.filter((image) => !query.types || query.types.includes(image.type))
		.filter((image) => !query.languages || query.languages.includes(image.language))
		.sort(query.sort === "quality" ? byQuality : byVotes)
		.map((image) => ({
			...image,
			language_name: image.language
				? (languageNames.of(image.language) ?? image.language)
				: "Textless",
		}));

/**
 * Lists every backdrop, poster, and logo TMDB has for a series' title, in
 * every language, plus each season's posters for a show, so a season's own
 * can be chosen for it. Titles TMDB does not list have none.
 *
 * The first listing for a title fetches them from TMDB and stores them
 * (see `titleImage`); later ones, for any series of the title, read what was
 * stored, until {@link refreshSeriesImages} fetches them again.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 * @throws {@link UpstreamUnavailableError} when TMDB fails on the first listing.
 */
export const listSeriesImages = async (
	seriesId: string,
	query: SeriesImageQuery = {},
): Promise<SeriesImage[]> => {
	const row = await imageStateOf(seriesId);
	const images = row.imagesFetchedAt
		? await storedImagesOf(row.key)
		: await storeImages(row.key as SeriesKey, day);

	return applyQuery(images, query);
};

/**
 * Fetches a series' title's images from TMDB again, past TMDB's own cache,
 * and replaces the stored ones, so artwork added on TMDB since can be
 * chosen. Returns them as {@link listSeriesImages} does.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 * @throws {@link UpstreamUnavailableError} when TMDB fails; the stored images are kept.
 */
export const refreshSeriesImages = async (
	seriesId: string,
	query: SeriesImageQuery = {},
): Promise<SeriesImage[]> => {
	const row = await imageStateOf(seriesId);
	return applyQuery(await storeImages(row.key as SeriesKey, 0), query);
};
