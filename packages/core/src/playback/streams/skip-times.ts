import { z } from "zod";

import { getAnime } from "../../catalog/queries/anime";

/** A skippable span of an episode, in seconds from the start. */
export interface SkipSegment {
  kind: "opening" | "ending" | "recap";
  /** `true` when the song plays over story content, so skipping may lose scenes. */
  mixed: boolean;
  start: number;
  end: number;
  /**
   * Length of the encode the segment was timed against. Different releases of
   * the same episode drift, so clients should prefer segments whose length is
   * close to their stream's duration.
   */
  episodeLength: number;
}

const AniSkipResponseSchema = z.object({
  found: z.boolean(),
  results: z.array(
    z.object({
      interval: z.object({
        startTime: z.number().nonnegative(),
        endTime: z.number().positive()
      }),
      skipType: z.enum(["op", "ed", "mixed-op", "mixed-ed", "recap"]),
      episodeLength: z.number().nonnegative()
    })
  )
});

const kinds = {
  op: {
    kind: "opening",
    mixed: false
  },
  ed: {
    kind: "ending",
    mixed: false
  },
  "mixed-op": {
    kind: "opening",
    mixed: true
  },
  "mixed-ed": {
    kind: "ending",
    mixed: true
  },
  recap: {
    kind: "recap",
    mixed: false
  }
} as const;

/**
 * Looks up crowd-sourced opening, ending, and recap timestamps from AniSkip.
 *
 * Skip times are an enhancement, so any lookup failure, or an anime without a
 * MyAnimeList ID, yields an empty list instead of an error.
 *
 * @param durationSeconds - The playing stream's duration. When supplied,
 *   AniSkip only returns segments timed against a similar-length encode.
 *
 * @throws {@link AnimeNotFoundError} when the anime does not exist.
 */
export async function getSkipTimes(anilistId: number, episode: number, durationSeconds?: number): Promise<SkipSegment[]> {
  const anime = await getAnime(anilistId);
  if (!anime.malId || !Number.isInteger(episode)) {
    return [];
  }

  const url = new URL(`https://api.aniskip.com/v2/skip-times/${anime.malId}/${episode}`);
  for (const type of Object.keys(kinds)) {
    url.searchParams.append("types[]", type);
  }
  url.searchParams.set("episodeLength", String(durationSeconds ? Math.round(durationSeconds) : 0));

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5_000)
    });
    // AniSkip answers 404 with `found: false` when nothing is known.
    const body = AniSkipResponseSchema.parse(await response.json());

    return body.results
      .filter((result) => result.interval.endTime > result.interval.startTime)
      .map((result) => ({
        ...kinds[result.skipType],
        start: result.interval.startTime,
        end: result.interval.endTime,
        episodeLength: result.episodeLength
      }))
      .sort((left, right) => left.start - right.start);
  } catch {
    return [];
  }
}
