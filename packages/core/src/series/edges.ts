import { attempt } from "@sora/shared";
import { eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";

import { db } from "../database/client";
import { imageEdge, noArtwork, series, seriesEpisode, titleArtwork } from "../database/schema";

/** An image's average colour down its left and right edges, each `#rrggbb`. */
export interface ImageEdges {
	left: string;
	right: string;
}

/** Columns averaged at each edge, of the image scaled to {@link measuredWidth}. */
const edgeColumns = 2;

/** The width images are measured at; TMDB serves this size directly. */
const measuredWidth = 92;

/**
 * Joins a series to its {@link titleArtwork} row. Qualified by hand: Drizzle
 * leaves columns bare in a single-table select, where `series.key` would bind
 * to the subquery's own `key`.
 */
const artworkOfSeries = sql`${titleArtwork}.${sql.identifier(titleArtwork.key.name)} = ${series}.${sql.identifier(series.key.name)}`;

/**
 * The series' backdrop as readers see it: the one chosen for its TMDB title
 * (see `titleArtwork`), none when that was chosen, else the laid-out one.
 */
export const effectiveBackdrop = sql<string | null>`nullif(coalesce(
    (select ${titleArtwork.backdropUrlOverride} from ${titleArtwork} where ${artworkOfSeries}),
    ${series.backdropUrl}
  ), ${noArtwork})`;

/** The series' logo as readers see it; see {@link effectiveBackdrop}. */
export const effectiveLogo = sql<string | null>`nullif(coalesce(
    (select ${titleArtwork.logoUrlOverride} from ${titleArtwork} where ${artworkOfSeries}),
    ${series.logoUrl}
  ), ${noArtwork})`;

/**
 * An episode's still as readers see it: a film's episode shows its series'
 * {@link effectiveBackdrop} rather than TMDB's own, and any other keeps its
 * stored one. Needs the episode's series joined.
 */
export const effectiveStill = sql<
	string | null
>`case when ${series.kind} = 'movie' then coalesce(${effectiveBackdrop}, ${seriesEpisode.stillUrl}) else ${seriesEpisode.stillUrl} end`;

/**
 * Measures the edges of a series' backdrop as readers see it, unless they
 * are stored already. See {@link storeImageEdges}.
 */
export async function storeBackdropEdges(seriesId: string): Promise<boolean> {
	const [row] = await db
		.select({
			url: effectiveBackdrop,
		})
		.from(series)
		.where(eq(series.id, seriesId))
		.limit(1);

	return row?.url ? storeImageEdges(row.url) : false;
}

/**
 * Measures every backdrop readers see whose edges are not stored, such as
 * those that failed to load when their series was stored. Returns how many
 * were stored and how many failed again.
 */
export async function storeMissingBackdropEdges(): Promise<{
	stored: number;
	failed: number;
}> {
	const rows = await db
		.selectDistinct({
			url: effectiveBackdrop,
		})
		.from(series)
		.leftJoin(imageEdge, eq(imageEdge.url, effectiveBackdrop))
		.where(isNull(imageEdge.url));

	let stored = 0;
	for (const { url } of rows) {
		if (url && (await storeImageEdges(url))) {
			stored += 1;
		}
	}

	return {
		stored,
		failed: rows.filter((row) => row.url).length - stored,
	};
}

/**
 * Measures the average colour down an image's left and right edges and
 * stores it under the image's URL, unless it is stored already. Returns
 * whether it is stored.
 *
 * Never throws: an image that fails to load or decode is left for
 * {@link storeMissingBackdropEdges} to measure again.
 */
async function storeImageEdges(url: string): Promise<boolean> {
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

	const { data: edges, error } = await attempt(measureEdges(url));
	if (error) {
		console.warn(`Could not measure the edges of ${url}: ${error.message}`);
		return false;
	}

	await db
		.insert(imageEdge)
		.values({
			url,
			...edges,
		})
		.onConflictDoNothing();
	return true;
}

async function measureEdges(url: string): Promise<ImageEdges> {
	const small = url.replace(/(\/image\.tmdb\.org\/t\/p\/)[^/]+/, `$1w${measuredWidth}`);
	const response = await fetch(small, {
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) {
		throw new Error(`${small} answered ${response.status}`);
	}

	const { data, info } = await sharp(Buffer.from(await response.arrayBuffer()))
		.resize({
			width: measuredWidth,
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
			for (let x = from; x < from + edgeColumns; x += 1) {
				const offset = (y * info.width + x) * info.channels;
				for (let channel = 0; channel < 3; channel += 1) {
					sum[channel]! += data[offset + channel]!;
				}
			}
		}

		const pixels = info.height * edgeColumns;
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
		right: average(info.width - edgeColumns),
	};
}
