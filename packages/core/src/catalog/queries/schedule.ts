import { anilist } from "../../anilist/client";
import { AiringScheduleDocument } from "../../anilist/graphql.generated";
import { InvalidInputError } from "../../errors";
import { day, hour, minute } from "../../time";
import { fromUnixSeconds } from "../models/text";

/** One AniList episode broadcast. */
export interface AiringBroadcast {
  anilistId: number;
  episode: number;
  /** ISO 8601 timestamp. */
  airingAt: string;
}

/** The longest window {@link fetchAiringSchedule} accepts, to bound upstream paging. */
const maximumScheduleWindowMs = 14 * day;

/**
 * Lists AniList episodes airing between `from` (inclusive) and `until`
 * (exclusive), in broadcast order. Adult media is excluded.
 *
 * @throws {@link InvalidInputError} when the window is empty or longer than 14 days.
 * @throws {@link UpstreamUnavailableError} when AniList cannot be reached.
 */
export async function fetchAiringSchedule(from: Date, until: Date): Promise<AiringBroadcast[]> {
  const windowMs = until.getTime() - from.getTime();
  if (!(windowMs > 0 && windowMs <= maximumScheduleWindowMs)) {
    throw new InvalidInputError("The schedule window must be between 0 and 14 days long");
  }

  // Widen the upstream window to whole hours so nearby calls share a cached
  // snapshot, then trim to the exact window below. AniList's bounds are
  // exclusive, hence the one-second shift.
  const variables = {
    from: Math.floor(from.getTime() / hour) * (hour / 1_000) - 1,
    until: Math.ceil(until.getTime() / hour) * (hour / 1_000) + 1
  };
  const episodes: AiringBroadcast[] = [];

  for (let page = 1; ; page += 1) {
    const { Page } = await anilist(
      AiringScheduleDocument,
      {
        ...variables,
        page
      },
      {
        maxAgeMs: 15 * minute
      }
    );

    for (const entry of Page?.airingSchedules ?? []) {
      const airingAt = entry ? entry.airingAt * 1_000 : 0;
      const inWindow = airingAt >= from.getTime() && airingAt < until.getTime();
      if (entry?.media && !entry.media.isAdult && inWindow) {
        episodes.push({
          anilistId: entry.media.id,
          episode: entry.episode,
          airingAt: fromUnixSeconds(entry.airingAt)
        });
      }
    }

    if (!Page?.pageInfo?.hasNextPage) {
      return episodes;
    }
  }
}
