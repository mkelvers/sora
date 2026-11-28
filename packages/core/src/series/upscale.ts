import { attempt, sequence } from "@sora/shared";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../database/client";
import { series, titleArtwork, titleBackdropUpscale, titleImage } from "../database/schema/series";
import type { UpscaleStatus } from "../database/schema/series";
import { InvalidInputError, UnknownSeriesError } from "../errors";
import type { UpscaleState } from "../models/series";
import { hasLiveUpscale, isUpscaling, requestUpscale } from "../scheduler/queue";
import { collage } from "./collage";
import { trueWidth } from "./detail";
import { edges } from "./edges";
import { models, upscale } from "./realesrgan";
import type { Model } from "./realesrgan";
import { upscaledBackdropUrl } from "./upscaled-backdrop";

/**
 * The version of the upscaling {@link upscales.run} makes, kept as
 * `titleBackdropUpscale.method`. Raise it when the upscaling changes, and
 * the scheduler makes every older upscale again; see
 * {@link upscales.remakeOutdated}.
 *
 * 2 shrinks a picture to the size its detail was drawn at (see
 * {@link trueWidth}) and redraws it four times larger with
 * `models.restore` when that is at most 1080p; a picture with more detail
 * than that gets the 2× `models.cleanup` pass of 1.
 */
const currentMethod = 2;

/**
 * Where each upscale stands, by the original's URL. A pending row is
 * `upscaling` while its job runs and `queued` while the job waits; with no
 * live job it is shown as failed so the viewer can retry it. Reading status
 * leaves the row alone and sees the row and queue in the same SQL snapshot.
 */
export const statusesOf = async (key: string) => {
	const rows = await db
		.select({
			height: titleBackdropUpscale.height,
			id: titleBackdropUpscale.id,
			sourceUrl: titleBackdropUpscale.sourceUrl,
			status: sql<UpscaleState>`case
				when ${titleBackdropUpscale.status} <> 'pending' then ${titleBackdropUpscale.status}
				when ${isUpscaling(titleBackdropUpscale.id)} then 'upscaling'
				when ${hasLiveUpscale(titleBackdropUpscale.id)} then 'queued'
				else 'failed'
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

	/**
	 * Keeps a finished picture under a new ID, and so a new URL, since a URL's
	 * picture is cached as never changing: a remade upscale must not reach
	 * viewers under the old one. Chooses it for its title where the original
	 * or the picture made before is still the chosen backdrop. Returns whether
	 * it was kept: the title may have been deleted meanwhile.
	 */
	async keep(picture: { image: Buffer; width: number; height: number }) {
		const before = upscaledBackdropUrl(this.#id);

		const kept = await db.transaction(async (tx) => {
			const [row] = await tx
				.update(titleBackdropUpscale)
				.set({
					failure: null,
					height: picture.height,
					id: sql`gen_random_uuid()`,
					image: picture.image,
					method: currentMethod,
					status: "done" satisfies UpscaleStatus,
					width: picture.width,
				})
				.where(eq(titleBackdropUpscale.id, this.#id))
				.returning({
					id: titleBackdropUpscale.id,
				});

			if (!row) {
				return null;
			}

			const url = upscaledBackdropUrl(row.id);

			const chosen = await tx
				.update(titleArtwork)
				.set({
					backdropUrlOverride: url,
				})
				.where(
					and(
						eq(titleArtwork.key, this.#key),
						inArray(titleArtwork.backdropUrlOverride, [this.#sourceUrl, before]),
					),
				)
				.returning({
					key: titleArtwork.key,
				});

			return {
				chosen: chosen.length > 0,
				url,
			};
		});

		if (kept?.chosen) {
			await edges.store(kept.url);
		}

		return kept !== null;
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
			await edges.store(url);
		}
	}

	/**
	 * Records that the upscale failed, and why. A remake that fails keeps the
	 * picture made before and stays done, so its title keeps its backdrop.
	 */
	async fail(failure: string) {
		await db
			.update(titleBackdropUpscale)
			.set({
				failure,
				status: sql<UpscaleStatus>`case when ${titleBackdropUpscale.status} = 'done' then 'done' else 'failed' end`,
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

		const { data, error } = await attempt(collage.test(sourceUrl));

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

export const upscales = {
	/**
	 * Queues every upscale an older version of the upscaling made (see
	 * {@link currentMethod}) to be made again, one at a time like every
	 * upscale and behind every upscale a viewer asked for. Each keeps its
	 * picture until the new one is ready.
	 * Runs when the scheduler starts; an upscale already queued is left alone.
	 */
	async remakeOutdated() {
		const outdated = await db
			.select({
				id: titleBackdropUpscale.id,
			})
			.from(titleBackdropUpscale)
			.where(
				and(
					eq(titleBackdropUpscale.status, "done"),
					lt(titleBackdropUpscale.method, currentMethod),
				),
			);

		await sequence.all(outdated, ({ id }) =>
			db.transaction((tx) =>
				requestUpscale(
					tx,
					{
						id,
					},
					{
						newAttempt: false,
						remake: true,
					},
				),
			),
		);
	},

	/**
	 * Asks for one of a series' title's backdrops to be upscaled. The scheduler
	 * makes it (see {@link upscales.run}) and, when it is ready and the
	 * original is still the title's chosen backdrop, chooses it in its place.
	 * Asking again keeps a live job, chooses a ready upscale, or queues a new
	 * attempt after a failure or a lost job.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 * @throws {InvalidInputError} when the URL is not one of the title's backdrops.
	 */
	async request(id: string, url: string) {
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
				await requestUpscale(
					tx,
					{
						id: stored.id,
					},
					{
						newAttempt: true,
						remake: false,
					},
				);

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
				await requestUpscale(
					tx,
					{
						id: existing.id,
					},
					{
						newAttempt: false,
						remake: false,
					},
				);
			}

			if (existing?.status === "done") {
				return existing.id;
			}
		});

		if (readyId) {
			await new Upscale(readyId, row.key, url).choose();
		}
	},

	/**
	 * Makes one requested upscale, or makes again one an older version of the
	 * upscaling made (see {@link currentMethod}): fetches the original from
	 * TMDB, upscales it, and keeps it as a JPEG under a new ID (see
	 * `Upscale.keep`). Records a failure on the upscale rather than throwing,
	 * so whoever asked sees it.
	 */
	async run(id: string) {
		/** JPEG quality an upscaled backdrop is stored at. */
		const storedQuality = 92;

		/**
		 * The widest an upscaled backdrop is kept: 4K, which is as sharp as a screen
		 * shows it. The upscaler makes it larger than that, and bringing it back
		 * down is what removes what blur is left.
		 */
		const maxUpscaledWidth = 3840;

		/**
		 * The widest a picture's detail may be to be redrawn with `models.restore`:
		 * 1080p, which it makes 4K. A picture with more detail of its own keeps
		 * it better with `models.cleanup`, which also costs a processor a third
		 * as much per pixel.
		 */
		const restoreUpTo = 1920;

		const [row] = await db
			.select({
				key: titleBackdropUpscale.key,
				method: titleBackdropUpscale.method,
				sourceUrl: titleBackdropUpscale.sourceUrl,
				status: titleBackdropUpscale.status,
			})
			.from(titleBackdropUpscale)
			.where(eq(titleBackdropUpscale.id, id))
			.limit(1);

		if (!row) {
			return;
		}

		const isOutdated = row.status === "done" && row.method < currentMethod;

		if (row.status !== "pending" && !isOutdated) {
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

			const original = new Uint8Array(await response.arrayBuffer());
			const width = await trueWidth(original);
			let model: Model = models.cleanup;
			let source = original;

			if (width <= restoreUpTo) {
				model = models.restore;
				source = await sharp(original)
					.resize({
						kernel: "lanczos3",
						width,
					})
					.png()
					.toBuffer();
			}

			const png = await upscale(source, model);

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

			const kept = await job.keep({
				height: info.height,
				image: data,
				width: info.width,
			});

			if (!kept) {
				return;
			}
		} catch (error) {
			let failure = "Upscaling failed";

			if (error instanceof Error) {
				failure = error.message;
			}

			await job.fail(failure);

			return;
		}

		await job.lookAtOriginal();
	},
};
