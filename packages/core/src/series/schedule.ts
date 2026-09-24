import { inArray } from "drizzle-orm";

import { fetchAiringSchedule } from "../catalog/queries/schedule";
import { db } from "../database/client";
import { series } from "../database/schema";
import { scheduleSeriesStore } from "../scheduler/queue";
import { anilistEpisodeKey, findSeasonEpisodes } from "./episodes";
import type { SeriesCard } from "./models";
import { toSeriesCard } from "./queries";
import { storedSeriesIds } from "./store";

/** One episode broadcast in the release calendar. */
export interface ScheduledEpisode {
  series: SeriesCard;
  seasonId: string;
  /** Position within the season, from 1. */
  episode: number;
  /** ISO 8601 timestamp. */
  airingAt: string;
}

/**
 * Lists episodes airing between `from` (inclusive) and `until` (exclusive),
 * in broadcast order.
 *
 * Only stored titles are listed. A broadcast of an entry no stored title
 * contains is queued for the scheduler to lay out and appears once stored;
 * the scheduler stores airing anime daily, so this is rare. A broadcast
 * that cannot be placed in its title's seasons yet, such as the premiere of
 * a season whose episode count is unknown, is also left out.
 *
 * @throws {@link InvalidInputError} when the window is empty or longer than 14 days.
 * @throws {@link UpstreamUnavailableError} when AniList cannot be reached.
 */
export async function getAiringSchedule(from: Date, until: Date): Promise<ScheduledEpisode[]> {
  const broadcasts = await fetchAiringSchedule(from, until);
  const anilistIds = [...new Set(broadcasts.map((broadcast) => broadcast.anilistId))];

  const stored = await storedSeriesIds(anilistIds);
  for (const anilistId of anilistIds.filter((id) => !stored.has(id))) {
    await scheduleSeriesStore(anilistId, "backfill");
  }

  const placed = await findSeasonEpisodes(broadcasts, {
    placeUnlisted: true
  });
  const seriesIds = [...new Set([...placed.values()].map((ref) => ref.seriesId))];
  const rows = seriesIds.length > 0 ? await db.select().from(series).where(inArray(series.id, seriesIds)) : [];
  const cards = new Map(rows.map((row) => [row.id, toSeriesCard(row)]));

  return broadcasts.flatMap((broadcast) => {
    const ref = placed.get(anilistEpisodeKey(broadcast.anilistId, broadcast.episode));
    const card = ref ? cards.get(ref.seriesId) : undefined;
    return ref && card
      ? [
          {
            series: card,
            seasonId: ref.seasonId,
            episode: ref.number,
            airingAt: broadcast.airingAt
          }
        ]
      : [];
  });
}
