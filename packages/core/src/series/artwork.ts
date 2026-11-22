import { day } from "@sora/shared";
import { and, eq } from "drizzle-orm";

import { db } from "../database/client";
import { noArtwork, series, titleArtwork, titleBackdropUpscale } from "../database/schema/series";
import { InvalidInputError, SeriesNotFoundError } from "../errors";
import type { ArtworkChanges, ImageType, Series, SeriesImage } from "../models/series";
import { measureBackdrop } from "./edges";
import { getSeries } from "./queries";
import { TitleImages } from "./title-images";
import { upscaleIdOf } from "./upscaled-backdrop";

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
	 * Defaults to "votes".
	 */
	sort?: "votes" | "quality";
}

/** A choice of a series' artwork, for the TMDB title with `key`. */
class Choice {
	readonly #key: string;
	readonly #changes: ArtworkChanges;

	constructor(key: string, changes: ArtworkChanges) {
		this.#key = key;
		this.#changes = changes;
	}

	/**
	 * The stored override of the image of `type`: the chosen URL at the TMDB size it
	 * is saved in, {@link noArtwork} for `false`, or `undefined` when it is left as it is.
	 */
	override(type: ImageType) {
		/** The TMDB size an image is saved in once chosen: the largest one it is shown at. */
		const savedSizes = {
			backdrop: "original",
			logo: "w500",
			poster: "w780",
		} as const;

		const changes = {
			backdrop: this.#changes.backdrop_url,
			logo: this.#changes.logo_url,
			poster: this.#changes.poster_url,
		};

		const change = changes[type];

		if (change === false) {
			return noArtwork;
		}

		return change?.replace("/original/", `/${savedSizes[type]}/`);
	}

	/**
	 * Checks that an upscaled backdrop in the changes is one of the title's,
	 * ready, and that no poster or logo is one.
	 */
	async requireOwnUpscales() {
		const changes = this.#changes;

		if ([changes.poster_url, changes.logo_url].some((url) => url && upscaleIdOf(url) !== null)) {
			throw new InvalidInputError("Only a backdrop can be an upscaled one");
		}

		const backdrop = changes.backdrop_url;

		if (!backdrop) {
			return;
		}

		const id = upscaleIdOf(backdrop);

		if (id === null) {
			return;
		}

		const [upscale] = await db
			.select({
				id: titleBackdropUpscale.id,
			})
			.from(titleBackdropUpscale)
			.where(
				and(
					eq(titleBackdropUpscale.id, id),
					eq(titleBackdropUpscale.key, this.#key),
					eq(titleBackdropUpscale.status, "done"),
				),
			)
			.limit(1);

		if (!upscale) {
			throw new InvalidInputError("That is not an upscaled backdrop of the title");
		}
	}
}

/**
 * Chooses a series' poster, backdrop, or logo for everyone, in place of the
 * one laid out from TMDB or AniList. The poster is the series' own, since
 * it tells one season from another; the backdrop, logo, and logo placement
 * are chosen for the TMDB title, so every series laid out from it shows
 * them (see `titleArtwork`). The choice outlives laying the series out
 * again. Returns the series as {@link getSeries} loads it.
 *
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 */
export const setSeriesArtwork = async (id: string, changes: ArtworkChanges): Promise<Series> => {
	const [row] = await db
		.select({
			key: series.key,
		})
		.from(series)
		.where(eq(series.id, id))
		.limit(1);

	if (!row) {
		throw new SeriesNotFoundError(id);
	}

	const choice = new Choice(row.key, changes);
	await choice.requireOwnUpscales();

	const poster = choice.override("poster");

	const title = {
		backdropUrlOverride: choice.override("backdrop"),
		logoOffsetX: changes.logo_offset_x,
		logoOffsetY: changes.logo_offset_y,
		logoScale: changes.logo_scale,
		logoUrlOverride: choice.override("logo"),
	};

	await db.transaction(async (tx) => {
		if (poster !== undefined) {
			await tx
				.update(series)
				.set({
					posterUrlOverride: poster,
				})
				.where(eq(series.id, id));
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
		await measureBackdrop(id);
	}

	return getSeries(id);
};

/**
 * Lists every backdrop, poster, and logo TMDB has for a series' title, in
 * every language, plus each season's posters for a show, so a season's own
 * can be chosen for it. Titles TMDB does not list have none.
 *
 * The first listing for a title fetches them from TMDB and stores them
 * (see `titleImage`); later ones, for any series of the title, read what was
 * stored, until {@link refreshSeriesImages} fetches them again.
 *
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 * @throws {UpstreamUnavailableError} when TMDB fails on the first listing.
 */
export const listSeriesImages = async (
	id: string,
	query: SeriesImageQuery = {},
): Promise<SeriesImage[]> => {
	const { fetched, images } = await TitleImages.of(id);

	if (fetched) {
		return await images.listed(await images.stored(), query);
	}

	return await images.listed(await images.store(day), query);
};

/**
 * Fetches a series' title's images from TMDB again, past TMDB's own cache,
 * and replaces the stored ones, so artwork added on TMDB since can be
 * chosen. Returns them as {@link listSeriesImages} does.
 *
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 * @throws {UpstreamUnavailableError} when TMDB fails; the stored images are kept.
 */
export const refreshSeriesImages = async (
	id: string,
	query: SeriesImageQuery = {},
): Promise<SeriesImage[]> => {
	const { images } = await TitleImages.of(id);

	return await images.listed(await images.store(0), query);
};
