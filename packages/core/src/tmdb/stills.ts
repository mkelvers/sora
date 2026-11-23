import { attempt, defined } from "@sora/shared";
import { eq } from "drizzle-orm";

import { config } from "../config";
import { db } from "../database/client";
import { episodeStill } from "../database/schema/series";
import { UpstreamUnavailableError } from "../errors";
import { Frame } from "./frame";
import type { TmdbEpisode, TmdbImage } from "./resources";
import { loadStillModel, stillModel } from "./still-model";
import { StillRank } from "./still-rank";

/**
 * Orders a TMDB episode's stills, best first. A still is better when:
 *
 * 1. it has no language. TMDB gives one to art with a logo or text on it:
 *    of 1,691 stills of 40 anime, 99 had a language and at least 25 of them
 *    were such art, where of 64 picked at random from the 1,592 without one,
 *    1 had text.
 * 2. it is widescreen, which the episode cards crop to anyway.
 * 3. it is at least 1000 pixels wide.
 * 4. TMDB's voters rate it higher.
 *
 * and then TMDB's own pick comes first, then the larger one.
 */
export const rankStills = (stills: readonly TmdbImage[], defaultPath: string | null): TmdbImage[] =>
	stills.toSorted((left, right) => {
		const leftTier = new StillRank(left).tier;
		const rightTier = new StillRank(right).tier;

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
	const frame = await Frame.of(image);

	return frame.bars;
};

/** Whether {@link blackBars} finds bars thick enough to see. */
export const hasBlackBars = async (image: Buffer): Promise<boolean> => {
	/** Bars thinner than this share of the frame are not seen, and not counted. */
	const thinnestBar = 0.02;

	return (await blackBars(image)) >= thinnestBar;
};

/** CLIP, loaded on first use; a load that fails is forgotten, so the next still tries again. */
class Classifier {
	/** The one the process shares, so the model loads once. */
	static readonly shared = new Classifier();

	#loading: ReturnType<typeof loadStillModel> | null = null;

	/** @throws {UpstreamUnavailableError} when the model cannot be loaded. */
	async load() {
		this.#loading ??= loadStillModel(config.stillModelDir);
		const loaded = await attempt(this.#loading);

		if (loaded.error) {
			this.#loading = null;
			throw new UpstreamUnavailableError(`could not load ${stillModel}: ${loaded.error.message}`, {
				cause: loaded.error,
				retryAfterMs: null,
			});
		}

		return loaded.data;
	}
}

/**
 * Whether a still is a title card, a logo, or other text rather than a
 * scene, as CLIP, run here on the CPU, reads it. It reads stylised lettering
 * that OCR does not: it found 22 of 30 stills with a logo, a title, or text
 * over them in a set of 1,691, among them every plain title card (Bleach's
 * numbered cards, Dragon Ball's chapter cards), for 12 others turned away.
 * It misses a logo over a scene, which the language TMDB gives such a still
 * catches (see `rankStills`).
 *
 * @throws {UpstreamUnavailableError} when the model cannot be loaded.
 */
export const showsText = async (image: Buffer): Promise<boolean> => {
	/**
	 * A still is a scene when CLIP gives it at least this much of its
	 * probability. Bleach's title card of episode 18, which CLIP finds hardest,
	 * gets 0.79. Of 1,323 stills from 430 episodes, this turns away every one the
	 * whole 32-bit model turned away at 0.75, and four more: two title cards and
	 * a poster it let through, and a letterboxed scene that its black bars turn
	 * away first.
	 */
	const sceneShare = 0.8;

	const classify = await Classifier.shared.load();

	return (await classify(image)) < sceneShare;
};

/**
 * Gives each episode the still stored for it by `chooseStill`, in place of
 * TMDB's own pick, and none when none was fit to show. An episode with
 * nothing stored keeps TMDB's pick until one is.
 */
export const withChoices = async (
	showId: number,
	episodes: TmdbEpisode[],
): Promise<TmdbEpisode[]> => {
	const chosen = await db.select().from(episodeStill).where(eq(episodeStill.showId, showId));

	const paths = new Map(
		chosen.map((row) => [`${row.seasonNumber}:${row.episodeNumber}`, row.path]),
	);

	return episodes.map((episode) => {
		const key = `${episode.season_number}:${episode.episode_number}`;

		if (paths.has(key)) {
			return {
				...episode,
				still_path: paths.get(key) ?? null,
			};
		}

		return episode;
	});
};
