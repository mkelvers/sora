import { attempt, sequence } from "@sora/shared";
import { eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../database/client";
import {
	imageEdge,
	noArtwork,
	series,
	titleEpisode,
	titleArtwork,
} from "../database/schema/series";
import { getUpscaledBackdrop, upscaleIdOf } from "./upscaled-backdrop";

/** An image's average colour down its left and right edges, each `#rrggbb`. */
export interface ImageEdges {
	left: string;
	right: string;
}

/**
 * Joins a series to its {@link titleArtwork} row. Qualified by hand: Drizzle
 * leaves columns bare in a single-table select, where `series.key` would bind
 * to the subquery's own `key`.
 */
const artworkJoin = sql`${titleArtwork}.${sql.identifier(titleArtwork.key.name)} = ${series}.${sql.identifier(series.key.name)}`;

/**
 * The series' backdrop as readers see it: the one chosen for its TMDB title
 * (see `titleArtwork`), none when that was chosen, else the laid-out one.
 */
export const effectiveBackdrop = sql<string | null>`nullif(coalesce(
    (select ${titleArtwork.backdropUrlOverride} from ${titleArtwork} where ${artworkJoin}),
    ${series.backdropUrl}
  ), ${noArtwork})`;

/** The series' logo as readers see it; see {@link effectiveBackdrop}. */
export const effectiveLogo = sql<string | null>`nullif(coalesce(
    (select ${titleArtwork.logoUrlOverride} from ${titleArtwork} where ${artworkJoin}),
    ${series.logoUrl}
  ), ${noArtwork})`;

/**
 * An episode's still as readers see it: a film's episode shows its series'
 * {@link effectiveBackdrop} rather than TMDB's own, and any other its stored
 * still, or the backdrop when it has none. Needs the episode's series joined.
 */
export const effectiveStill = sql<
	string | null
>`case when ${series.kind} = 'movie' then coalesce(${effectiveBackdrop}, ${titleEpisode.stillUrl}) else coalesce(${titleEpisode.stillUrl}, ${effectiveBackdrop}) end`;

/** An image, by its URL, whose edges are measured. */
class Picture {
	/** Columns averaged at each edge, of the image scaled to {@link Picture.#width}. */
	static readonly #columns = 2;

	/** The width images are measured at; TMDB serves this size directly. */
	static readonly #width = 92;

	readonly #url: string;

	constructor(url: string) {
		this.#url = url;
	}

	/** The image's average colour down its left and right edges. */
	async edges(): Promise<ImageEdges> {
		const columns = Picture.#columns;

		const { data, info } = await sharp(await this.#bytes())
			.resize({
				width: Picture.#width,
				withoutEnlargement: true,
			})
			.removeAlpha()
			.raw()
			.toBuffer({
				resolveWithObject: true,
			});

		const average = (from: number) => {
			const sum = [0, 0, 0];

			for (let y = 0; y < info.height; y += 1) {
				for (let x = from; x < from + columns; x += 1) {
					const offset = (y * info.width + x) * info.channels;

					for (let channel = 0; channel < 3; channel += 1) {
						sum[channel] = (sum[channel] ?? 0) + (data[offset + channel] ?? 0);
					}
				}
			}

			const pixels = info.height * columns;

			return `#${sum
				.map((total) =>
					Math.round(total / pixels)
						.toString(16)
						.padStart(2, "0"),
				)
				.join("")}`;
		};

		return {
			left: average(0),
			right: average(info.width - columns),
		};
	}

	/** The image's bytes: an upscaled backdrop's from the database, any other from its host at {@link Picture.#width}. */
	async #bytes(): Promise<Uint8Array> {
		const url = this.#url;
		const upscaleId = upscaleIdOf(url);

		if (upscaleId) {
			const stored = await getUpscaledBackdrop(upscaleId);

			if (!stored) {
				throw new Error(`${url} is not stored`);
			}

			return stored;
		}

		const small = url.replace(
			/(?<prefix>\/image\.tmdb\.org\/t\/p\/)[^/]+/u,
			`$1w${Picture.#width}`,
		);

		const response = await fetch(small, {
			signal: AbortSignal.timeout(10_000),
		});

		if (!response.ok) {
			throw new Error(`${small} answered ${response.status}`);
		}

		return new Uint8Array(await response.arrayBuffer());
	}
}

/**
 * Measures the average colour down an image's left and right edges and
 * stores it under the image's URL, unless it is stored already. Returns
 * whether it is stored.
 *
 * Never throws: an image that fails to load or decode is left for
 * {@link storeMissingBackdropEdges} to measure again.
 */
export const storeImageEdges = async (url: string): Promise<boolean> => {
	const [stored] = await db
		.select({
			url: imageEdge.url,
		})
		.from(imageEdge)
		.where(eq(imageEdge.url, url))
		.limit(1);

	if (stored) {
		return true;
	}

	const { data, error } = await attempt(new Picture(url).edges());

	if (error) {
		console.warn(`Could not measure the edges of ${url}: ${error.message}`);

		return false;
	}

	await db
		.insert(imageEdge)
		.values({
			url,
			...data,
		})
		.onConflictDoNothing();

	return true;
};

/**
 * Measures the edges of a series' backdrop as readers see it, unless they
 * are stored already. See {@link storeImageEdges}.
 */
export const measureBackdrop = async (id: string): Promise<boolean> => {
	const [row] = await db
		.select({
			url: effectiveBackdrop,
		})
		.from(series)
		.where(eq(series.id, id))
		.limit(1);

	if (row?.url) {
		return storeImageEdges(row.url);
	}

	return false;
};

/**
 * Measures every backdrop readers see whose edges are not stored, such as
 * those that failed to load when their series was stored. Returns how many
 * were stored and how many failed again.
 */
export const storeMissingBackdropEdges = async (): Promise<{
	stored: number;
	failed: number;
}> => {
	const rows = await db
		.selectDistinct({
			url: effectiveBackdrop,
		})
		.from(series)
		.leftJoin(imageEdge, eq(imageEdge.url, effectiveBackdrop))
		.where(isNull(imageEdge.url));

	const urls = rows.flatMap(({ url }) => {
		if (url) {
			return [url];
		}

		return [];
	});

	const results = await sequence.all(urls, (url) => storeImageEdges(url));
	const stored = results.filter(Boolean).length;

	return {
		failed: urls.length - stored,
		stored,
	};
};
