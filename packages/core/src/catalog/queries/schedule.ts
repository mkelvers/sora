import { anilist } from "../../anilist/client";
import { AiringScheduleDocument } from "../../anilist/graphql.generated";
import { InvalidInputError } from "../../errors";
import { day, hour, minute } from "../../time";
import { toAnimeCard, type AnimeCard } from "../models/anime";
import { fromUnixSeconds } from "../models/text";

/** One episode broadcast in the release calendar. */
export interface ScheduledEpisode {
  /** AniList airing schedule ID; stable for the lifetime of the entry. */
  id: number;
  episode: number;
  /** ISO 8601 timestamp. */
  airingAt: string;
  anime: AnimeCard;
}

/** The longest window {@link getAiringSchedule} accepts, to bound upstream paging. */
const maximumScheduleWindowMs = 14 * day;

/**
 * Lists episodes airing between `from` (inclusive) and `until` (exclusive),
 * in broadcast order. Adult media is excluded.
 *
 * @throws {@link InvalidInputError} when the window is empty or longer than 14 days.
 */
export async function getAiringSchedule(from: Date, until: Date): Promise<ScheduledEpisode[]> {
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
  const episodes: ScheduledEpisode[] = [];

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
          id: entry.id,
          episode: entry.episode,
          airingAt: fromUnixSeconds(entry.airingAt),
          anime: toAnimeCard(entry.media)
        });
      }
    }

    if (!Page?.pageInfo?.hasNextPage) {
      return episodes;
    }
  }
}
