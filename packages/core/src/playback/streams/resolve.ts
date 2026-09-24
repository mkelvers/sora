import type { BaseProvider, ContentLanguage, IVideoPayload } from "anime-sdk";
import { z } from "zod";

import { getAnime } from "../../catalog/queries/anime";
import { EpisodeNotFoundError, InvalidInputError, PlaybackUnavailableError, type ProviderAttempt } from "../../errors";
import { locateEpisode } from "../../series/episodes";
import { getProviderUnits, type ProviderUnit } from "../episodes/episodes";
import { getEpisodeVersions, type EpisodeVersion } from "../episodes/versions";
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

/** One version of an episode, ready to play. */
export interface PlaybackVersion {
  language: ContentLanguage;
  /**
   * BCP 47 language of the dub's audio or of the sub's subtitles. `null` for
   * raw.
   */
  locale: string | null;
  /** The provider that serves this version. */
  provider: string;
  /** Ordered best first. */
  sources: PlaybackSource[];
  subtitles: PlaybackSubtitle[];
}

/** Everything a player needs to start an episode, in every version it has. */
export interface Playback {
  animeId: string;
  seasonId: string;
  /** Position within the season, from 1. */
  episode: number;
  /** Every version a provider can stream right now: sub before dub before raw, and each by locale. */
  versions: PlaybackVersion[];
}

export const PlaybackRequestSchema = z.object({
  animeId: z.string().min(1),
  seasonId: z.string().min(1),
  /** Position within the season, from 1. */
  episode: z.number().int().positive()
});

export type PlaybackRequest = z.input<typeof PlaybackRequestSchema>;

/**
 * Tried when no provider that lists languages truthfully lists the episode,
 * since the others may still stream it.
 */
const fallbackVersions: readonly EpisodeVersion[] = [
  {
    language: "sub",
    locale: "en"
  },
  {
    language: "dub",
    locale: "en"
  }
];

const qualityRank: Record<IVideoPayload["quality"], number> = {
  auto: 0,
  "1080p": 1,
  "720p": 2,
  "480p": 3,
  "360p": 4
};

/**
 * Resolves playable streams for one episode in every version providers
 * offer it in, such as sub and dub, at once. Each version comes from the
 * first provider serving its locale that can stream it; a version none can
 * stream right now is left out.
 *
 * Stream URLs are never exposed; clients receive proxy tokens so upstream
 * headers and hosts stay on the server.
 *
 * @throws {@link InvalidInputError} when the request fails {@link PlaybackRequestSchema}.
 * @throws {@link SeasonNotFoundError} when the season does not exist, or
 *   does not belong to the series.
 * @throws {@link EpisodeNotFoundError} when the season has no such episode,
 *   the episode is an extra only TMDB lists, or no provider lists it.
 * @throws {@link PlaybackUnavailableError} when providers list the episode but
 *   none can currently stream any version of it.
 */
export async function resolvePlayback(request: PlaybackRequest): Promise<Playback> {
  const parsed = PlaybackRequestSchema.safeParse(request);
  if (!parsed.success) {
    throw new InvalidInputError("Invalid playback request", {
      cause: parsed.error
    });
  }

  const { animeId, seasonId, episode } = parsed.data;
  const located = await locateEpisode(seasonId, episode, animeId);
  const anime = await getAnime(located.anilistId);
  const offered = await getEpisodeVersions(located);

  // Versions share each provider's episode list.
  const lists = new Map<string, Promise<ProviderUnit[]>>();
  const unitsOf = (provider: BaseProvider) => {
    const list = lists.get(provider.id) ?? getProviderUnits(anime, provider);
    lists.set(provider.id, list);
    return list;
  };

  const results = await Promise.all(
    (offered.length > 0 ? offered : fallbackVersions).map((version) =>
      resolveVersion(version, located.anilistEpisode, unitsOf)
    )
  );
  const versions = results.flatMap((result) => (result.version ? [result.version] : []));
  if (versions.length > 0) {
    return {
      animeId,
      seasonId,
      episode,
      versions
    };
  }

  if (!results.some((result) => result.listed)) {
    throw new EpisodeNotFoundError(seasonId, episode);
  }

  throw new PlaybackUnavailableError(
    seasonId,
    episode,
    results.flatMap((result) => result.attempts)
  );
}

/**
 * Resolves one version of an AniList episode, trying each provider that
 * serves its locale in priority order until one succeeds.
 */
async function resolveVersion(
  { language, locale }: EpisodeVersion,
  anilistEpisode: number,
  unitsOf: (provider: BaseProvider) => Promise<ProviderUnit[]>
): Promise<{
  version: PlaybackVersion | null;
  /** Whether a provider serving the locale lists the episode. */
  listed: boolean;
  attempts: ProviderAttempt[];
}> {
  const attempts: ProviderAttempt[] = [];
  const fail = (provider: BaseProvider, reason: string) =>
    attempts.push({
      provider: provider.id,
      reason: `${language}${locale ? ` (${locale})` : ""}: ${reason}`
    });
  let listed = false;

  for (const { provider, locale: providerLocale } of streamProviders) {
    if (locale !== null && providerLocale !== locale) {
      continue;
    }

    try {
      const unit = (await unitsOf(provider)).find((candidate) => candidate.number === anilistEpisode);
      if (!unit) {
        fail(provider, "Episode not listed");
        continue;
      }

      listed = true;
      if (unit.languages && !unit.languages.includes(language)) {
        fail(provider, `No ${language} audio`);
        continue;
      }

      const resolved = await provider.resolveStream(unit.id, language);
      if (resolved.type !== "video" || resolved.streams.length === 0) {
        fail(provider, "No video streams returned");
        continue;
      }

      return {
        version: {
          language,
          locale,
          provider: provider.id,
          ...toPlaybackMedia(resolved.streams)
        },
        listed,
        attempts
      };
    } catch (cause) {
      fail(provider, cause instanceof Error ? cause.message : "Provider failed");
    }
  }

  return {
    version: null,
    listed,
    attempts
  };
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
