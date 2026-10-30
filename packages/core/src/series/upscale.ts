import { attempt } from "@sora/shared";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../database/client";
import { series, titleArtwork, titleBackdropUpscale, titleImage } from "../database/schema/series";
import type { UpscaleStatus } from "../database/schema/series";
import { InvalidInputError, SeriesNotFoundError } from "../errors";
import { maxUpscaledSourceWidth } from "../models/series";
import { requestUpscale } from "../scheduler/queue";
import { isCollage } from "./collage";
import { storeImageEdges } from "./edges";
import { upscale } from "./realesrgan";
import { upscaledBackdropUrl } from "./upscaled-backdrop";

/** JPEG quality an upscaled backdrop is stored at. */
const storedQuality = 92;

/** Where each upscale of a title's backdrops stands, by the original's URL. */
export const upscalesOf = async (key: string) => {
	const rows = await db
		.select({
			id: titleBackdropUpscale.id,
			sourceUrl: titleBackdropUpscale.sourceUrl,
			status: titleBackdropUpscale.status,
		})
		.from(titleBackdropUpscale)
		.where(eq(titleBackdropUpscale.key, key));

	return new Map(rows.map((row) => [row.sourceUrl, row]));
};

/** Chooses an upscaled backdrop for its title, unless another backdrop has been chosen since. */
const chooseUpscale = async (key: string, sourceUrl: string, id: string) => {
	const url = upscaledBackdropUrl(id);
	const chosen = await db
		.update(titleArtwork)
		.set({
			backdropUrlOverride: url,
		})
		.where(and(eq(titleArtwork.key, key), eq(titleArtwork.backdropUrlOverride, sourceUrl)))
		.returning({
			key: titleArtwork.key,
		});

	if (chosen.length > 0) {
		await storeImageEdges(url);
	}
};

/**
 * Asks for one of a series' title's backdrops to be upscaled. The scheduler
 * makes it (see {@link upscaleBackdrop}) and, when it is ready and the
 * original is still the title's chosen backdrop, chooses it in its place.
 * Asking again for one that is queued or ready changes nothing; for one that
 * failed, tries again.
 *
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 * @throws {InvalidInputError} when the URL is not one of the title's backdrops, or is too large to upscale.
 */
export const requestBackdropUpscale = async (seriesId: string, url: string) => {
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

	const [image] = await db
		.select({
			width: titleImage.width,
		})
		.from(titleImage)
		.where(
			and(eq(titleImage.key, row.key), eq(titleImage.type, "backdrop"), eq(titleImage.url, url)),
		)
		.limit(1);
	if (!image) {
		throw new InvalidInputError("That is not one of the title's backdrops");
	}
	if (image.width >= maxUpscaledSourceWidth) {
		throw new InvalidInputError(
			`Backdrops ${maxUpscaledSourceWidth}px wide or more are large enough already`,
		);
	}

	const [stored] = await db
		.insert(titleBackdropUpscale)
		.values({
			key: row.key,
			sourceUrl: url,
		})
		.onConflictDoUpdate({
			set: {
				failure: null,
				status: "pending",
			},
			setWhere: eq(titleBackdropUpscale.status, "failed"),
			target: [titleBackdropUpscale.key, titleBackdropUpscale.sourceUrl],
		})
		.returning({
			id: titleBackdropUpscale.id,
		});

	if (stored) {
		await requestUpscale({
			id: stored.id,
		});
		return;
	}

	// Queued or ready already; a ready one may not be the chosen backdrop yet.
	const [existing] = await db
		.select({
			id: titleBackdropUpscale.id,
			status: titleBackdropUpscale.status,
		})
		.from(titleBackdropUpscale)
		.where(and(eq(titleBackdropUpscale.key, row.key), eq(titleBackdropUpscale.sourceUrl, url)))
		.limit(1);
	if (existing?.status === "done") {
		await chooseUpscale(row.key, url, existing.id);
	}
};

/**
 * Tells whether the original is a collage, if that was not looked at yet:
 * the home page looks only at originals already 4K, but an upscale may
 * reach 4K from a smaller one, and it is a collage if its original is.
 * Never throws; the home page then leaves the title out until it is known.
 */
const lookAtOriginal = async (key: string, sourceUrl: string) => {
	const [image] = await db
		.select({
			isCollage: titleImage.isCollage,
		})
		.from(titleImage)
		.where(
			and(eq(titleImage.key, key), eq(titleImage.type, "backdrop"), eq(titleImage.url, sourceUrl)),
		)
		.limit(1);
	if (!image || image.isCollage !== null) {
		return;
	}

	const { data, error } = await attempt(isCollage(sourceUrl));
	if (error) {
		console.warn(`Could not look at ${sourceUrl}: ${error.message}`);
		return;
	}

	await db
		.update(titleImage)
		.set({
			isCollage: data,
		})
		.where(
			and(eq(titleImage.key, key), eq(titleImage.type, "backdrop"), eq(titleImage.url, sourceUrl)),
		);
};

const fail = async (id: string, failure: string) => {
	await db
		.update(titleBackdropUpscale)
		.set({
			failure,
			status: "failed" satisfies UpscaleStatus,
		})
		.where(eq(titleBackdropUpscale.id, id));
};

/**
 * Makes one requested upscale: fetches the original from TMDB, upscales it,
 * and keeps it as a JPEG. Records a failure on the upscale rather than
 * throwing, so whoever asked sees it.
 */
export const upscaleBackdrop = async (id: string) => {
	const [row] = await db
		.select({
			key: titleBackdropUpscale.key,
			sourceUrl: titleBackdropUpscale.sourceUrl,
			status: titleBackdropUpscale.status,
		})
		.from(titleBackdropUpscale)
		.where(eq(titleBackdropUpscale.id, id))
		.limit(1);
	if (row?.status !== "pending") {
		return;
	}

	try {
		const response = await fetch(row.sourceUrl, {
			signal: AbortSignal.timeout(30_000),
		});
		if (!response.ok) {
			await fail(id, `TMDB answered ${response.status}`);
			return;
		}

		const png = await upscale(new Uint8Array(await response.arrayBuffer()));
		const { data, info } = await sharp(png)
			.jpeg({
				mozjpeg: true,
				quality: storedQuality,
			})
			.toBuffer({
				resolveWithObject: true,
			});

		await db
			.update(titleBackdropUpscale)
			.set({
				failure: null,
				height: info.height,
				image: data,
				status: "done",
				width: info.width,
			})
			.where(eq(titleBackdropUpscale.id, id));
	} catch (error) {
		await fail(id, error instanceof Error ? error.message : "Upscaling failed");
		return;
	}

	await lookAtOriginal(row.key, row.sourceUrl);
	await chooseUpscale(row.key, row.sourceUrl, id);
};
