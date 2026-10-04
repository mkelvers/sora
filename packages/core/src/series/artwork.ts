import { eq } from "drizzle-orm";

import { db } from "../database/client";
import { noArtwork, series, titleArtwork, titleImage } from "../database/schema";
import { SeriesNotFoundError } from "../errors";
import type { ArtworkChanges, ImageType, Series, SeriesImage } from "../models/series";
import { day } from "../time";
import {
	getImages,
	getSeasonPosters,
	getShow,
	tmdbImageUrl,
	type TmdbImage,
} from "../tmdb/resources";
import { storeBackdropEdges } from "./edges";
import { getSeries } from "./queries";
import { parseKey, type SeriesKey } from "./series";

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
function toOverride(change: string | false | null | undefined) {
	return change === false ? noArtwork : change;
}

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
export async function setSeriesArtwork(seriesId: string, changes: ArtworkChanges): Promise<Series> {
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

	const poster = toOverride(changes.poster_url);
	const title = {
		backdropUrlOverride: toOverride(changes.backdrop_url),
		logoUrlOverride: toOverride(changes.logo_url),
		logoScale: changes.logo_scale,
		logoOffsetX: changes.logo_offset_x,
		logoOffsetY: changes.logo_offset_y,
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
					target: titleArtwork.key,
					set: title,
				});
		}
	});

	if (title.backdropUrlOverride !== undefined) {
		await storeBackdropEdges(seriesId);
	}

	return getSeries(seriesId);
}

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
export async function listSeriesImages(
	seriesId: string,
	query: SeriesImageQuery = {},
): Promise<SeriesImage[]> {
	const row = await imageStateOf(seriesId);
	const images = row.imagesFetchedAt
		? await storedImagesOf(row.key)
		: await storeImages(row.key as SeriesKey, day);

	return applyQuery(images, query);
}

/**
 * Fetches a series' title's images from TMDB again, past TMDB's own cache,
 * and replaces the stored ones, so artwork added on TMDB since can be
 * chosen. Returns them as {@link listSeriesImages} does.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 * @throws {@link UpstreamUnavailableError} when TMDB fails; the stored images are kept.
 */
export async function refreshSeriesImages(
	seriesId: string,
	query: SeriesImageQuery = {},
): Promise<SeriesImage[]> {
	const row = await imageStateOf(seriesId);
	return applyQuery(await storeImages(row.key as SeriesKey, 0), query);
}

async function imageStateOf(seriesId: string) {
	const [row] = await db
		.select({
			key: series.key,
			imagesFetchedAt: titleArtwork.imagesFetchedAt,
		})
		.from(series)
		.leftJoin(titleArtwork, eq(titleArtwork.key, series.key))
		.where(eq(series.id, seriesId))
		.limit(1);
	if (!row) {
		throw new SeriesNotFoundError(seriesId);
	}

	return row;
}

function applyQuery(images: SeriesImage[], query: SeriesImageQuery) {
	return images
		.filter((image) => !query.types || query.types.includes(image.type))
		.filter((image) => !query.languages || query.languages.includes(image.language))
		.sort(query.sort === "quality" ? byQuality : byVotes);
}

async function storedImagesOf(key: string): Promise<SeriesImage[]> {
	return db
		.select({
			type: titleImage.type,
			url: titleImage.url,
			width: titleImage.width,
			height: titleImage.height,
			language: titleImage.language,
			vote_average: titleImage.voteAverage,
			vote_count: titleImage.voteCount,
			season_number: titleImage.seasonNumber,
		})
		.from(titleImage)
		.where(eq(titleImage.key, key));
}

/** Fetches a title's images from TMDB, no older than `maxAgeMs`, and stores them in place of the old. */
async function storeImages(key: SeriesKey, maxAgeMs: number): Promise<SeriesImage[]> {
	const images = await fetchImages(key, maxAgeMs);

	await db.transaction(async (tx) => {
		await tx
			.insert(titleArtwork)
			.values({
				key,
				imagesFetchedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: titleArtwork.key,
				set: {
					imagesFetchedAt: new Date(),
				},
			});
		await tx.delete(titleImage).where(eq(titleImage.key, key));
		if (images.length > 0) {
			await tx
				.insert(titleImage)
				.values(
					images.map((image) => ({
						key,
						type: image.type,
						url: image.url,
						width: image.width,
						height: image.height,
						language: image.language,
						voteAverage: image.vote_average,
						voteCount: image.vote_count,
						seasonNumber: image.season_number,
					})),
				)
				.onConflictDoNothing();
		}
	});

	return images;
}

async function fetchImages(key: SeriesKey, maxAgeMs: number): Promise<SeriesImage[]> {
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
		...(own?.posters ?? []).map((image) => toSeriesImage("poster", image, null)),
		...(own?.backdrops ?? []).map((image) => toSeriesImage("backdrop", image, null)),
		...(own?.logos ?? []).map((image) => toSeriesImage("logo", image, null)),
		...seasons,
	].filter((image) => {
		const key = `${image.type}:${image.url}`;
		return !seen.has(key) && seen.add(key);
	});
}

/** Every season's posters, specials included. */
async function seasonPostersOf(showId: number, maxAgeMs: number): Promise<SeriesImage[]> {
	// A refresh also finds seasons added since; otherwise the show's usual lifetime will do.
	const show = await getShow(showId, maxAgeMs === 0 ? { maxAgeMs } : {});
	const perSeason = await Promise.all(
		(show?.seasons ?? []).map(async ({ seasonNumber }) =>
			(
				await getSeasonPosters(showId, seasonNumber, {
					maxAgeMs,
				})
			).map((image) => toSeriesImage("poster", image, seasonNumber)),
		),
	);
	return perSeason.flat();
}

function toSeriesImage(
	type: ImageType,
	image: TmdbImage,
	seasonNumber: number | null,
): SeriesImage {
	return {
		type,
		url: tmdbImageUrl(image.file_path, "original")!,
		width: image.width,
		height: image.height,
		language: image.iso_639_1,
		vote_average: image.vote_average,
		vote_count: image.vote_count,
		season_number: seasonNumber,
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
	return (image.vote_average * image.vote_count + 5 * priorVotes) / (image.vote_count + priorVotes);
}
