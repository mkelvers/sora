import { attempt } from "@sora/shared";
import { and, eq, sql } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../database/client";
import { series, titleArtwork, titleBackdropUpscale, titleImage } from "../database/schema/series";
import type { UpscaleStatus } from "../database/schema/series";
import { InvalidInputError, UnknownSeriesError } from "../errors";
import { hasLiveUpscaleJob, requestUpscale } from "../scheduler/queue";
import { isCollage } from "./collage";
import { storeImageEdges } from "./edges";
import { upscale } from "./realesrgan";
import { upscaledBackdropUrl } from "./upscaled-backdrop";

/**
 * Where each upscale stands, by the original's URL. A pending row with no
 * live job is shown as failed so the viewer can retry it. Reading status
 * leaves the row alone and sees the row and queue in the same SQL snapshot.
 */
export const statusesOf = async (key: string) => {
	const rows = await db
		.select({
			height: titleBackdropUpscale.height,
			id: titleBackdropUpscale.id,
			sourceUrl: titleBackdropUpscale.sourceUrl,
			status: sql<UpscaleStatus>`case
				when ${titleBackdropUpscale.status} = 'pending' and not ${hasLiveUpscaleJob(titleBackdropUpscale.id)}
				then 'failed'
				else ${titleBackdropUpscale.status}
			end`,
			width: titleBackdropUpscale.width,
		})
		.from(titleBackdropUpscale)
		.where(eq(titleBackdropUpscale.key, key));

	return new Map(rows.map((row) => [row.sourceUrl, row]));
};

/** One upscale of a title's backdrop, by its ID, the title's key, and the original's URL. */
class Upscale {
	readonly #id: string;
	readonly #key: string;
	readonly #sourceUrl: string;

	constructor(id: string, key: string, sourceUrl: string) {
		this.#id = id;
		this.#key = key;
		this.#sourceUrl = sourceUrl;
	}

	/** Chooses the upscaled backdrop for its title, unless another backdrop has been chosen since. */
	async choose() {
		const url = upscaledBackdropUrl(this.#id);

		const chosen = await db
			.update(titleArtwork)
			.set({
				backdropUrlOverride: url,
			})
			.where(
				and(eq(titleArtwork.key, this.#key), eq(titleArtwork.backdropUrlOverride, this.#sourceUrl)),
			)
			.returning({
				key: titleArtwork.key,
			});

		if (chosen.length > 0) {
			await storeImageEdges(url);
		}
	}

	/** Records that the upscale failed, and why. */
	async fail(failure: string) {
		await db
			.update(titleBackdropUpscale)
			.set({
				failure,
				status: "failed" satisfies UpscaleStatus,
			})
			.where(eq(titleBackdropUpscale.id, this.#id));
	}

	/**
	 * Tells whether the original is a collage, if that was not looked at yet:
	 * the home page looks only at originals already 4K, but an upscale may
	 * reach 4K from a smaller one, and it is a collage if its original is.
	 * Never throws; the home page then leaves the title out until it is known.
	 */
	async lookAtOriginal() {
		const key = this.#key;
		const sourceUrl = this.#sourceUrl;

		const [image] = await db
			.select({
				isCollage: titleImage.isCollage,
			})
			.from(titleImage)
			.where(
				and(
					eq(titleImage.key, key),
					eq(titleImage.type, "backdrop"),
					eq(titleImage.url, sourceUrl),
				),
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
				and(
					eq(titleImage.key, key),
					eq(titleImage.type, "backdrop"),
					eq(titleImage.url, sourceUrl),
				),
			);
	}
}

/**
 * Asks for one of a series' title's backdrops to be upscaled. The scheduler
 * makes it (see {@link upscaleBackdrop}) and, when it is ready and the
 * original is still the title's chosen backdrop, chooses it in its place.
 * Asking again keeps a live job, chooses a ready upscale, or queues a new
 * attempt after a failure or a lost job.
 *
 * @throws {UnknownSeriesError} when the ID does not identify a series.
 * @throws {InvalidInputError} when the URL is not one of the title's backdrops.
 */
export const requestBackdropUpscale = async (id: string, url: string) => {
	const [row] = await db
		.select({
			key: series.key,
		})
		.from(series)
		.where(eq(series.id, id))
		.limit(1);

	if (!row) {
		throw new UnknownSeriesError(id);
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

	const readyId = await db.transaction(async (tx) => {
		// ON CONFLICT locks the existing row even when setWhere skips the update.
		// A competing request must wait for this transaction's job to commit.
		const [stored] = await tx
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
			.returning({ id: titleBackdropUpscale.id });

		if (stored) {
			await requestUpscale(tx, { id: stored.id }, true);

			return;
		}

		const [existing] = await tx
			.select({
				id: titleBackdropUpscale.id,
				status: titleBackdropUpscale.status,
			})
			.from(titleBackdropUpscale)
			.where(and(eq(titleBackdropUpscale.key, row.key), eq(titleBackdropUpscale.sourceUrl, url)))
			.limit(1);

		if (existing?.status === "pending") {
			await requestUpscale(tx, { id: existing.id }, false);
		}

		if (existing?.status === "done") {
			return existing.id;
		}
	});

	if (readyId) {
		await new Upscale(readyId, row.key, url).choose();
	}
};

/**
 * Makes one requested upscale: fetches the original from TMDB, upscales it,
 * and keeps it as a JPEG. Records a failure on the upscale rather than
 * throwing, so whoever asked sees it.
 */
export const upscaleBackdrop = async (id: string) => {
	/** JPEG quality an upscaled backdrop is stored at. */
	const storedQuality = 92;

	/**
	 * The widest an upscaled backdrop is kept: 4K, which is as sharp as a screen
	 * shows it. A larger original is cleaned up at twice its size and then
	 * brought back down to this, which is what removes its blur.
	 */
	const maxUpscaledWidth = 3840;

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

	const job = new Upscale(id, row.key, row.sourceUrl);

	try {
		const response = await fetch(row.sourceUrl, {
			signal: AbortSignal.timeout(30_000),
		});

		if (!response.ok) {
			await job.fail(`TMDB answered ${response.status}`);

			return;
		}

		const png = await upscale(new Uint8Array(await response.arrayBuffer()));

		const { data, info } = await sharp(png)
			.resize({
				kernel: "lanczos3",
				width: maxUpscaledWidth,
				withoutEnlargement: true,
			})
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
		let failure = "Upscaling failed";

		if (error instanceof Error) {
			failure = error.message;
		}

		await job.fail(failure);

		return;
	}

	await job.lookAtOriginal();
	await job.choose();
};
