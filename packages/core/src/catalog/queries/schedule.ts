import { hour, chunked, sequence } from "@sora/shared";

import { anilist } from "../../anilist/client";
import { EpisodeAiringsDocument } from "../../anilist/graphql.generated";
import { zEpisodeAiringsQuery } from "../../anilist/validation.generated";
import { anilistKey } from "../../series/episodes";

/** One AniList episode broadcast. */
export interface AiringBroadcast {
	anilistId: number;
	episode: number;
	/** ISO 8601 timestamp. */
	airingAt: string;
}

/**
 * When each scheduled episode of the given AniList entries airs or aired, as
 * AniList's airing schedule records it: the moment of broadcast, which a
 * TMDB air date in Japan's calendar can place a day late.
 *
 * Episodes yet to air are included, so a response fetched just before a
 * broadcast still dates the episode it covers.
 *
 * Entries AniList has no schedule for, as for most older anime, have no
 * episodes in the result.
 *
 * @returns Broadcast times keyed by {@link anilistKey}.
 * @throws {UpstreamUnavailableError} when AniList cannot be reached.
 */
export const fetchEpisodeAirings = async (
	anilistIds: readonly number[],
): Promise<Map<string, Date>> => {
	/** Entries {@link fetchEpisodeAirings} asks AniList about per request. */
	const airingsBatchSize = 50;

	const ids = [...new Set(anilistIds)];
	const airings = new Map<string, Date>();

	const readPage = async (batch: number[], page: number): Promise<void> => {
		const { Page } = await anilist(
			EpisodeAiringsDocument,
			{
				ids: batch,
				page,
			},
			zEpisodeAiringsQuery,
			{
				maxAgeMs: hour,
			},
		);

		for (const entry of Page?.airingSchedules ?? []) {
			if (entry) {
				airings.set(anilistKey(entry.mediaId, entry.episode), new Date(entry.airingAt * 1000));
			}
		}

		if (Page?.pageInfo?.hasNextPage) {
			await readPage(batch, page + 1);
		}
	};

	await sequence.all(chunked(ids, airingsBatchSize), (batch) => readPage(batch, 1));

	return airings;
};
