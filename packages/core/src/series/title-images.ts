import { defined } from "@sora/shared";
import { eq } from "drizzle-orm";

import { db } from "../database/client";
import { series, titleArtwork, titleImage } from "../database/schema/series";
import { UnknownSeriesError } from "../errors";
import type { ImageType, SeriesImage } from "../models/series";
import { getImages, getSeasonPosters, getShow, imageUrl } from "../tmdb/resources";
import type { TmdbImage } from "../tmdb/resources";
import type { SeriesImageQuery } from "./artwork";
import { parseKey } from "./series";
import { statusesOf } from "./upscale";
import { upscaledBackdropUrl } from "./upscaled-backdrop";

/** An image as stored, before {@link TitleImages.listed} names its language. */
type StoredImage = Omit<SeriesImage, "language_name" | "upscale" | "upscaled">;

/** The backdrops, posters, and logos TMDB has for a TMDB title, by its series key. */
export class TitleImages {
	static readonly #languageNames = new Intl.DisplayNames(["en"], {
		type: "language",
	});

	readonly #key: string;

	constructor(key: string) {
		this.#key = key;
	}

	/**
	 * The images of a series' title, and whether they were ever fetched.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 */
	static async of(id: string) {
		const [row] = await db
			.select({
				imagesFetchedAt: titleArtwork.imagesFetchedAt,
				key: series.key,
			})
			.from(series)
			.leftJoin(titleArtwork, eq(titleArtwork.key, series.key))
			.where(eq(series.id, id))
			.limit(1);

		if (!row) {
			throw new UnknownSeriesError(id);
		}

		return {
			fetched: Boolean(row.imagesFetchedAt),
			images: new TitleImages(row.key),
		};
	}

	static #toStored(type: ImageType, image: TmdbImage, seasonNumber: number | null): StoredImage {
		return {
			height: image.height,
			language: image.iso_639_1,
			season_number: seasonNumber,
			type,
			url: defined(imageUrl(image.file_path, "original")),
			vote_average: image.vote_average,
			vote_count: image.vote_count,
			width: image.width,
		};
	}

	static #byArea(left: StoredImage, right: StoredImage) {
		return right.width * right.height - left.width * left.height;
	}

	/** A Bayesian average: as if every image also had three votes of 5. */
	static #confidence(image: StoredImage) {
		const priorVotes = 3;

		return (
			(image.vote_average * image.vote_count + 5 * priorVotes) / (image.vote_count + priorVotes)
		);
	}

	static #byQuality(left: StoredImage, right: StoredImage) {
		return (
			TitleImages.#byArea(left, right) ||
			TitleImages.#confidence(right) - TitleImages.#confidence(left)
		);
	}

	/**
	 * TMDB's rating, pulled toward 5 when few voted, so one 10 does not outrank
	 * dozens of 8s; then the larger image.
	 */
	static #byVotes(left: StoredImage, right: StoredImage) {
		return (
			TitleImages.#confidence(right) - TitleImages.#confidence(left) ||
			TitleImages.#byArea(left, right)
		);
	}

	/** The images as stored. */
	async stored(): Promise<StoredImage[]> {
		return await db
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
			.where(eq(titleImage.key, this.#key));
	}

	/** Fetches the images from TMDB, no older than `maxAgeMs`, and stores them in place of the old. */
	async store(maxAgeMs: number): Promise<StoredImage[]> {
		const key = this.#key;
		const images = await this.#fetch(maxAgeMs);

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
	}

	/** `images` named, with their upscales, filtered and sorted as `query` asks. */
	async listed(images: StoredImage[], query: SeriesImageQuery): Promise<SeriesImage[]> {
		const upscales = await statusesOf(this.#key);

		const listed = images.flatMap((image): SeriesImage[] => {
			let upscale: ReturnType<typeof upscales.get>;

			if (image.type === "backdrop") {
				upscale = upscales.get(image.url);
			}

			let languageName = "Textless";

			if (image.language) {
				languageName = TitleImages.#languageNames.of(image.language) ?? image.language;
			}

			const named = {
				...image,
				language_name: languageName,
			};

			const original = {
				...named,
				upscale: upscale?.status ?? null,
				upscaled: false,
			};

			// An upscaled backdrop is listed as one of its own, with its original's votes and language.
			if (upscale?.status !== "done") {
				return [original];
			}

			const { height, width } = upscale;

			if (!width || !height) {
				return [original];
			}

			return [
				original,
				{
					...named,
					height,
					upscale: null,
					upscaled: true,
					url: upscaledBackdropUrl(upscale.id),
					width,
				},
			];
		});

		let order = TitleImages.#byVotes;

		if (query.sort === "quality") {
			order = TitleImages.#byQuality;
		}

		return listed
			.filter((image) => !query.types || query.types.includes(image.type))
			.filter((image) => !query.languages || query.languages.includes(image.language))
			.toSorted(order);
	}

	async #fetch(maxAgeMs: number): Promise<StoredImage[]> {
		const [kind, id] = parseKey(this.#key);

		if (kind !== "tv" && kind !== "movie") {
			return [];
		}

		const ownImages = getImages(kind, id, {
			maxAgeMs,
		});

		let seasonPosters: Promise<StoredImage[]> | StoredImage[] = [];

		if (kind === "tv") {
			seasonPosters = this.#seasonPosters(maxAgeMs);
		}

		const [own, seasons] = await Promise.all([ownImages, seasonPosters]);

		// A season's poster is often the show's too; list it once, as the show's.
		const seen = new Set<string>();

		return [
			...(own?.posters ?? []).map((image) => TitleImages.#toStored("poster", image, null)),
			...(own?.backdrops ?? []).map((image) => TitleImages.#toStored("backdrop", image, null)),
			...(own?.logos ?? []).map((image) => TitleImages.#toStored("logo", image, null)),
			...seasons,
		].filter((image) => {
			const identity = `${image.type}:${image.url}`;

			return !seen.has(identity) && seen.add(identity);
		});
	}

	/** Every season's posters of the show, specials included. */
	async #seasonPosters(maxAgeMs: number): Promise<StoredImage[]> {
		const [, showId] = parseKey(this.#key);

		// A refresh also finds seasons added since; otherwise the show's usual lifetime will do.
		let options = {};

		if (maxAgeMs === 0) {
			options = {
				maxAgeMs,
			};
		}

		const show = await getShow(showId, options);

		const perSeason = await Promise.all(
			(show?.seasons ?? []).map(async ({ seasonNumber }) => {
				const posters = await getSeasonPosters(showId, seasonNumber, {
					maxAgeMs,
				});

				return posters.map((image) => TitleImages.#toStored("poster", image, seasonNumber));
			}),
		);

		return perSeason.flat();
	}
}
