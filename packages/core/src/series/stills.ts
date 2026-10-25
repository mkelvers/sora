import { attempt } from "@sora/shared";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../database/client";
import { episodeStill, series, seriesEpisode } from "../database/schema";
import { UpstreamUnavailableError } from "../errors";
import { getEpisodeStills, tmdbImageUrl } from "../tmdb/resources";
import { hasBlackBars, rankStills, showsText } from "../tmdb/stills";

/** How many stills of an episode are looked at, best ranked first, before the best ranked is taken. */
const stillsLooked = 8;

const loadStill = async (path: string): Promise<Buffer> => {
	const url = tmdbImageUrl(path, "w780")!;
	const response = await fetch(url, {
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) {
		throw new Error(`${url} answered ${response.status}`);
	}

	return Buffer.from(await response.arrayBuffer());
};

/**
 * Chooses the still of a TMDB episode: the best ranked (see `rankStills`)
 * of those TMDB lists for it that has no language, no black bars, and no
 * title card or text a model can read on it. A still with a language has a
 * logo or title over it more often than not, so it is not taken while
 * another exists.
 *
 * When none is fit, the best ranked is taken all the same: an episode with
 * a title card for a still, as Bleach's are, looks better than one with the
 * series' backdrop for it.
 *
 * @param defaultPath - TMDB's own pick for the episode, which wins ties and
 *   stands when TMDB lists no stills.
 * @returns The still's path, or `null` when TMDB has none for the episode.
 * @throws {@link UpstreamUnavailableError} when stills are listed but none
 *   could be loaded.
 */
export const chooseStill = async (
	showId: number,
	seasonNumber: number,
	episodeNumber: number,
	defaultPath: string | null,
): Promise<string | null> => {
	const ranked = rankStills(
		await getEpisodeStills(showId, seasonNumber, episodeNumber),
		defaultPath,
	);
	const pool = ranked.filter((still) => still.iso_639_1 === null).slice(0, stillsLooked);

	let measured = 0;
	for (const still of pool) {
		const { data, error } = await attempt(loadStill(still.file_path));
		if (error) {
			continue;
		}

		measured += 1;
		if (!(await hasBlackBars(data)) && !(await showsText(data))) {
			return still.file_path;
		}
	}

	if (pool.length > 0 && measured === 0) {
		throw new UpstreamUnavailableError("none of an episode's stills could be loaded", {
			retryAfterMs: null,
		});
	}

	return ranked[0]?.file_path ?? defaultPath;
};

/**
 * Stores the chosen still of a TMDB episode, `null` for none, and puts it on
 * the stored episodes of every series laid out from that show, so readers
 * see it before the series is laid out again.
 */
export const storeStill = async (
	showId: number,
	seasonNumber: number,
	episodeNumber: number,
	path: string | null,
): Promise<void> => {
	await db
		.insert(episodeStill)
		.values({
			chosenAt: new Date(),
			episodeNumber,
			path,
			seasonNumber,
			showId,
		})
		.onConflictDoUpdate({
			set: {
				chosenAt: new Date(),
				path,
			},
			target: [episodeStill.showId, episodeStill.seasonNumber, episodeStill.episodeNumber],
		});

	await db
		.update(seriesEpisode)
		.set({
			stillUrl: tmdbImageUrl(path, "original"),
		})
		.where(
			and(
				inArray(
					seriesEpisode.seriesId,
					db
						.select({
							id: series.id,
						})
						.from(series)
						.where(eq(series.key, `tv:${showId}`)),
				),
				eq(seriesEpisode.tmdbSeasonNumber, seasonNumber),
				eq(seriesEpisode.tmdbEpisodeNumber, episodeNumber),
			),
		);
};
