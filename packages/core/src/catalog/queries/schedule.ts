import { anilist } from "../../anilist/client";
import { EpisodeAiringsDocument } from "../../anilist/graphql.generated";
import { anilistEpisodeKey } from "../../series/episodes";
import { hour } from "../../time";

/** One AniList episode broadcast. */
export interface AiringBroadcast {
	anilistId: number;
	episode: number;
	/** ISO 8601 timestamp. */
	airingAt: string;
}

/** Entries {@link fetchEpisodeAirings} asks AniList about per request. */
const airingsBatchSize = 50;

/**
 * When each aired episode of the given AniList entries aired, as AniList's
 * airing schedule records it: the moment of broadcast, which a TMDB air
 * date in Japan's calendar can place a day late.
 *
 * Entries AniList has no schedule for, as for most older anime, have no
 * episodes in the result.
 *
 * @returns Broadcast times keyed by {@link anilistEpisodeKey}.
 * @throws {@link UpstreamUnavailableError} when AniList cannot be reached.
 */
export async function fetchEpisodeAirings(
	anilistIds: readonly number[],
): Promise<Map<string, Date>> {
	const ids = [...new Set(anilistIds)];
	const airings = new Map<string, Date>();
	for (let offset = 0; offset < ids.length; offset += airingsBatchSize) {
		const batch = ids.slice(offset, offset + airingsBatchSize);
		for (let page = 1; ; page += 1) {
			const { Page } = await anilist(
				EpisodeAiringsDocument,
				{
					ids: batch,
					page,
				},
				{
					maxAgeMs: hour,
				},
			);

			for (const entry of Page?.airingSchedules ?? []) {
				if (entry) {
					airings.set(
						anilistEpisodeKey(entry.mediaId, entry.episode),
						new Date(entry.airingAt * 1_000),
					);
				}
			}

			if (!Page?.pageInfo?.hasNextPage) {
				break;
			}
		}
	}

	return airings;
}
