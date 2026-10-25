import { env, pipeline, RawImage } from "@huggingface/transformers";
import { attempt, defined } from "@sora/shared";
import { eq } from "drizzle-orm";
import sharp from "sharp";

import { config } from "../config";
import { db } from "../database/client";
import { episodeStill } from "../database/schema";
import { UpstreamUnavailableError } from "../errors";
import type { TmdbEpisode, TmdbImage } from "./resources";

const widescreen = 16 / 9;

/** How far from 16:9 a still's aspect ratio may be and count as widescreen. */
const widescreenTolerance = 0.1;

/** Stills narrower than this are the last to be picked. */
const smallestWidth = 1000;

/** The width a still is measured at; TMDB serves this size directly. */
const measuredWidth = 320;
const measuredHeight = 180;

/**
 * A line of pixels counts as black when all but its brightest 2% are below
 * this luma. Lossy compression leaves a bar's pixels up to about 12; a dark
 * scene's vignette is above it within a few lines of the edge.
 */
const blackLuma = 12;

/**
 * A bar ends in a step: the lines just past it are brighter, on average,
 * than the ones just inside it by at least this much. A dark scene fades.
 */
const barStep = 10;

/** Bars thinner than this share of the frame are not seen, and not counted. */
const thinnestBar = 0.02;

/** A black edge wider than this share of the frame is a dark frame, not a bar. */
const widestBar = 0.4;

/**
 * Orders a TMDB episode's stills, best first. A still is better when:
 *
 * 1. it has no language. TMDB gives one to art with a logo or text on it:
 *    of 1,691 stills of 40 anime, 99 had a language and at least 25 of them
 *    were such art, where of 64 picked at random from the 1,592 without one,
 *    1 had text.
 * 2. it is widescreen, which the episode cards crop to anyway.
 * 3. it is at least {@link smallestWidth} wide.
 * 4. TMDB's voters rate it higher.
 *
 * and then TMDB's own pick comes first, then the larger one.
 */
export const rankStills = (
	stills: readonly TmdbImage[],
	defaultPath: string | null,
): TmdbImage[] => {
	const tier = (still: TmdbImage) => [
		Number(still.iso_639_1 !== null),
		Number(Math.abs(still.width / still.height - widescreen) > widescreenTolerance),
		Number(still.width < smallestWidth),
	];

	return stills.toSorted((left, right) => {
		const leftTier = tier(left);
		const rightTier = tier(right);
		for (const [index, value] of leftTier.entries()) {
			if (value !== rightTier[index]) {
				return value - defined(rightTier[index]);
			}
		}

		return (
			right.vote_average - left.vote_average ||
			Number(right.file_path === defaultPath) - Number(left.file_path === defaultPath) ||
			right.width - left.width
		);
	});
};

/**
 * The share of the frame that black bars take up along its widest edge:
 * `0.12` for the bars of a 2.35:1 picture in a 16:9 frame, 0 for a picture
 * without any. A still of 780 pixels or more is measured as 320 by 180.
 *
 * Tested on 1,661 real stills, it finds the bars of every one of 16 real
 * stills with them and wrongly flags one black-backed drawing; on 150 stills
 * given 1.33:1 to 2.35:1 bars, it finds every one at least 2% thick.
 */
export const blackBars = async (image: Buffer): Promise<number> => {
	const { data } = await sharp(image)
		.resize(measuredWidth, measuredHeight, {
			fit: "fill",
		})
		.greyscale()
		.raw()
		.toBuffer({
			resolveWithObject: true,
		});

	const lines = (count: number, length: number, at: (line: number, index: number) => number) =>
		Array.from(
			{
				length: count,
			},
			(_, line) => {
				const values = Array.from(
					{
						length,
					},
					(_value, index) => at(line, index),
				).toSorted((left, right) => left - right);
				return {
					brightest: defined(values[Math.floor(length * 0.98)]),
					mean: values.reduce((sum, value) => sum + value, 0) / length,
				};
			},
		);
	const depth = (edge: { brightest: number; mean: number }[]) => {
		let bar = 0;
		while (bar < edge.length && defined(edge[bar]).brightest < blackLuma) {
			bar += 1;
		}
		if (bar === 0 || bar > edge.length * widestBar) {
			return 0;
		}

		const inside = Math.max(...edge.slice(Math.max(0, bar - 2), bar).map((line) => line.mean));
		const outside = Math.max(...edge.slice(bar, bar + 2).map((line) => line.mean));
		return outside - inside >= barStep ? bar / edge.length : 0;
	};

	const rows = lines(measuredHeight, measuredWidth, (line, index) =>
		defined(data[line * measuredWidth + index]),
	);
	const columns = lines(measuredWidth, measuredHeight, (line, index) =>
		defined(data[index * measuredWidth + line]),
	);
	return Math.max(
		depth(rows),
		depth(rows.toReversed()),
		depth(columns),
		depth(columns.toReversed()),
	);
};

/** Whether {@link blackBars} finds bars thick enough to see. */
export const hasBlackBars = async (image: Buffer): Promise<boolean> =>
	(await blackBars(image)) >= thinnestBar;

const stillModel = "Xenova/clip-vit-base-patch32";

const sceneLabel = "a frame from an anime episode";

/** What CLIP is asked to tell a scene from; the scene is the first. */
const stillLabels = [
	sceneLabel,
	"a title card with large text or a logo",
	"a promotional poster with a logo",
	"a black screen with text",
];

/**
 * A still is a scene when CLIP gives it at least this much of its
 * probability. Bleach's title cards of episodes 7 and 18, which CLIP finds
 * hardest, get 0.72 and 0.68; of 1,691 stills, 1.4% more are turned away
 * than at 0.5, a few of them with text on them as well.
 */
const sceneShare = 0.75;

const loadClassifier = () => {
	if (config.stillModelDir) {
		env.cacheDir = config.stillModelDir;
	}

	return pipeline("zero-shot-image-classification", stillModel);
};

let classifier: ReturnType<typeof loadClassifier> | null = null;

/**
 * Whether a still is a title card, a logo, or other text rather than a
 * scene, as CLIP, run here on the CPU, reads it. It reads stylised lettering
 * that OCR does not: it found 22 of 30 stills with a logo, a title, or text
 * over them in a set of 1,691, among them every plain title card (Bleach's
 * numbered cards, Dragon Ball's chapter cards), for 12 others turned away.
 * It misses a logo over a scene, which the language TMDB gives such a still
 * catches (see `rankStills`).
 *
 * @throws {@link UpstreamUnavailableError} when the model cannot be loaded.
 */
export const showsText = async (image: Buffer): Promise<boolean> => {
	classifier ??= loadClassifier();
	const loaded = await attempt(classifier);
	if (loaded.error) {
		classifier = null;
		throw new UpstreamUnavailableError(`could not load ${stillModel}: ${loaded.error.message}`, {
			cause: loaded.error,
			retryAfterMs: null,
		});
	}

	const scored = await loaded.data(
		await RawImage.fromBlob(new Blob([new Uint8Array(image)])),
		stillLabels,
	);
	const scene = [scored].flat().find((score) => score.label === sceneLabel);
	return (scene?.score ?? 0) < sceneShare;
};

/**
 * Gives each episode the still stored for it by `chooseStill`, in place of
 * TMDB's own pick, and none when none was fit to show. An episode with
 * nothing stored keeps TMDB's pick until one is.
 */
export const withChosenStills = async (
	showId: number,
	episodes: TmdbEpisode[],
): Promise<TmdbEpisode[]> => {
	const chosen = await db.select().from(episodeStill).where(eq(episodeStill.showId, showId));
	const paths = new Map(
		chosen.map((row) => [`${row.seasonNumber}:${row.episodeNumber}`, row.path]),
	);

	return episodes.map((episode) => {
		const key = `${episode.season_number}:${episode.episode_number}`;
		return paths.has(key)
			? {
					...episode,
					still_path: paths.get(key) ?? null,
				}
			: episode;
	});
};
