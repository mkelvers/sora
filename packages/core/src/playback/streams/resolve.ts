import type { ContentLanguage, IVideoPayload } from "anime-sdk";
import { z } from "zod";

import { getAnime } from "../../catalog/queries/anime";
import { EpisodeNotFoundError, InvalidInputError, PlaybackUnavailableError, type ProviderAttempt } from "../../errors";
import { locateEpisode } from "../../series/episodes";
import { getProviderUnits } from "../episodes/episodes";
import { streamProviders } from "../providers/registry";
import { createStreamToken } from "../proxy/proxy";

/** One way to play an episode. */
export interface PlaybackSource {
  /** Stream proxy token; clients fetch it from the proxy route. */
  token: string;
  format: "hls" | "mp4";
  quality: IVideoPayload["quality"];
}

export interface PlaybackSubtitle {
  /** Stream proxy token for the subtitle file. */
  token: string;
  /** BCP 47 language tag, for example `en` or `pt-BR`. */
  language: string;
  label: string;
  format: "vtt" | "srt" | "ass" | null;
}

/** Everything a player needs to start an episode. */
export interface Playback {
  seasonId: string;
  /** Position within the season, from 1. */
  episode: number;
  language: ContentLanguage;
  /** The provider that served this playback. */
  provider: string;
  /** Ordered best first. */
  sources: PlaybackSource[];
  subtitles: PlaybackSubtitle[];
}

export const PlaybackRequestSchema = z.object({
  seasonId: z.string().min(1),
  /** Position within the season, from 1. */
  episode: z.number().int().positive(),
  language: z.enum(["sub", "dub", "raw"]).default("sub")
});

export type PlaybackRequest = z.input<typeof PlaybackRequestSchema>;

const qualityRank: Record<IVideoPayload["quality"], number> = {
  auto: 0,
  "1080p": 1,
  "720p": 2,
  "480p": 3,
  "360p": 4
};

/**
 * Resolves playable streams for one episode, trying each enabled provider in
 * priority order until one succeeds.
 *
 * Stream URLs are never exposed; clients receive proxy tokens so upstream
 * headers and hosts stay on the server.
 *
 * @throws {@link InvalidInputError} when the request fails {@link PlaybackRequestSchema}.
 * @throws {@link SeasonNotFoundError} when the season does not exist.
 * @throws {@link EpisodeNotFoundError} when the season has no such episode,
 *   the episode is an extra only TMDB lists, or no provider lists it.
 * @throws {@link PlaybackUnavailableError} when providers list the episode but
 *   none can currently stream it in the requested language.
 */
export async function resolvePlayback(request: PlaybackRequest): Promise<Playback> {
  const parsed = PlaybackRequestSchema.safeParse(request);
  if (!parsed.success) {
    throw new InvalidInputError("Invalid playback request", {
      cause: parsed.error
    });
  }

  const { seasonId, episode, language } = parsed.data;
  const located = await locateEpisode(seasonId, episode);
  const anime = await getAnime(located.anilistId);
  const attempts: ProviderAttempt[] = [];
  let listed = false;

  for (const provider of streamProviders) {
    try {
      const unit = (await getProviderUnits(anime, provider)).find((candidate) => candidate.number === located.anilistEpisode);
      if (!unit) {
        attempts.push({
          provider: provider.id,
          reason: "Episode not listed"
        });
        continue;
      }

      listed = true;
      if (unit.languages && !unit.languages.includes(language)) {
        attempts.push({
          provider: provider.id,
          reason: `No ${language} audio`
        });
        continue;
      }

      const resolved = await provider.resolveStream(unit.id, language);
      if (resolved.type !== "video" || resolved.streams.length === 0) {
        attempts.push({
          provider: provider.id,
          reason: "No video streams returned"
        });
        continue;
      }

      return {
        seasonId,
        episode,
        language,
        provider: provider.id,
        ...toPlaybackMedia(resolved.streams)
      };
    } catch (cause) {
      attempts.push({
        provider: provider.id,
        reason: cause instanceof Error ? cause.message : "Provider failed"
      });
    }
  }

  if (!listed) {
    throw new EpisodeNotFoundError(seasonId, episode);
  }

  throw new PlaybackUnavailableError(seasonId, episode, attempts);
}

function toPlaybackMedia(streams: IVideoPayload[]) {
  const sources = [...streams]
    .sort((left, right) => qualityRank[left.quality] - qualityRank[right.quality])
    .map((stream) => ({
      token: createStreamToken(stream.sourceUrl, stream.isHLS ? "playlist" : "file", stream.headers ?? {}),
      format: stream.isHLS ? ("hls" as const) : ("mp4" as const),
      quality: stream.quality
    }));

  // Providers attach the same subtitle tracks to every quality variant.
  const subtitles = new Map<string, PlaybackSubtitle>();
  for (const stream of streams) {
    for (const track of stream.subtitles ?? []) {
      if (!subtitles.has(track.url)) {
        subtitles.set(track.url, {
          token: createStreamToken(track.url, "subtitle", stream.headers ?? {}),
          language: track.language,
          label: track.label,
          format: track.format ?? null
        });
      }
    }
  }

  return {
    sources,
    subtitles: [...subtitles.values()]
  };
}
