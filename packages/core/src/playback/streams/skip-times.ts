import { z } from "zod";

import type { Anime } from "../../catalog/models/anime";
import { getAnime } from "../../catalog/queries/anime";
import { locateEpisode } from "../../series/episodes";
import { getProviderUnits } from "../episodes/episodes";
import { aniKotoProvider } from "../providers/registry";

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
   *
   * `null` for AniKoto's segments: AniKoto does not report it, but they are
   * timed against the stream AniKoto serves for playback.
   */
  episodeLength: number | null;
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
 * Looks up opening, ending, and recap timestamps for an episode.
 *
 * AniKoto's own times come first. Only when it has none for the episode does
 * the lookup fall back to crowd-sourced times from AniSkip.
 *
 * Skip times are an enhancement, so any lookup failure yields an empty list
 * instead of an error, as does an episode neither source knows.
 *
 * @param episode - Position within the season, from 1.
 * @param durationSeconds - The playing stream's duration. When supplied,
 *   AniSkip only returns segments timed against a similar-length encode.
 *
 * @throws {@link SeasonNotFoundError} when the season does not exist.
 * @throws {@link EpisodeNotFoundError} when the season has no such episode,
 *   or it is an extra only TMDB lists.
 */
export async function getSkipTimes(seasonId: string, episode: number, durationSeconds?: number): Promise<SkipSegment[]> {
  const located = await locateEpisode(seasonId, episode);
  const anime = await getAnime(located.anilistId);

  const fromAniKoto = await getAniKotoSkipTimes(anime, located.anilistEpisode);
  if (fromAniKoto.length > 0) {
    return fromAniKoto;
  }

  return getAniSkipTimes(anime, located.anilistEpisode, durationSeconds);
}

/**
 * AniKoto's opening and ending times, or an empty list when AniKoto does not
 * carry the episode, has no times for it, or fails.
 *
 * The sub embed is read whenever AniKoto lists one, since skip times are not
 * requested per language.
 */
async function getAniKotoSkipTimes(anime: Anime, anilistEpisode: number): Promise<SkipSegment[]> {
  try {
    const unit = (await getProviderUnits(anime, aniKotoProvider)).find((candidate) => candidate.number === anilistEpisode);
    if (!unit) {
      return [];
    }

    const language = !unit.languages || unit.languages.includes("sub") ? "sub" : unit.languages[0];
    if (!language) {
      return [];
    }

    const spans = await aniKotoProvider.resolveSkipSpans(unit.id, language, {
      signal: AbortSignal.timeout(5_000)
    });

    return spans.map((span) => ({
      ...span,
      mixed: false,
      episodeLength: null
    }));
  } catch {
    return [];
  }
}

/** AniSkip's crowd-sourced times, or an empty list when it has none or fails. */
async function getAniSkipTimes(anime: Anime, anilistEpisode: number, durationSeconds?: number): Promise<SkipSegment[]> {
  if (!anime.malId) {
    return [];
  }

  const url = new URL(`https://api.aniskip.com/v2/skip-times/${anime.malId}/${anilistEpisode}`);
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
