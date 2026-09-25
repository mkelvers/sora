import { z } from "zod";

import { getAnime } from "../../catalog/queries/anime";
import { EpisodeNotFoundError, InvalidInputError, PlaybackUnavailableError, type ProviderAttempt } from "../../errors";
import { locateEpisode } from "../../series/episodes";
import { getProviderUnits, type ProviderUnit } from "../episodes/episodes";
import { getEpisodeVersions, type EpisodeVersion } from "../episodes/versions";
import type { ContentLanguage } from "../../series/models";
import type { ProviderVideo, SkipSegment, StreamProvider, StreamQuality } from "../providers/provider";
import { isServedSubtitle, servedLocale, streamProviders } from "../providers/registry";
import { createStreamToken, tokenLifetimeMs } from "../proxy/proxy";

/** One way to play an episode. */
export interface PlaybackSource {
  /** The stream through the proxy, ready for a player to fetch. */
  url: string;
  format: "hls" | "mp4";
  quality: StreamQuality;
}

export interface PlaybackSubtitle {
  /** The subtitle file through the proxy, ready for a player to fetch. */
  url: string;
  /** BCP 47 language tag, for example `en` or `pt-BR`. */
  language: string;
  label: string;
  format: "vtt" | "srt" | "ass" | null;
}

/** One version of an episode, such as its dub, ready to play. */
export interface PlaybackMedia {
  /** Dubbed audio, the original audio with subtitles (sub), or the original audio alone (raw). */
  audio: ContentLanguage;
  /**
   * BCP 47 language of the dub's audio or of the sub's subtitles. `null` for
   * raw.
   */
  locale: string | null;
  /** The provider that serves this version. */
  provider: string;
  /**
   * Whether the subtitles are burned into the picture rather than served as
   * tracks: a sub whose `subtitles` is empty. Always `false` for dub and raw.
   */
  hardsub: boolean;
  /** Ordered best first. */
  sources: PlaybackSource[];
  /**
   * Every subtitle track of a sub, English first. A hardsub may still carry
   * tracks in other languages. Always empty for dub and raw.
   */
  subtitles: PlaybackSubtitle[];
  /**
   * Opening and ending, in playback order, timed against these sources: a
   * dub can be cut differently from its sub. Empty when the provider's player
   * reports none.
   */
  skipSegments: SkipSegment[];
}

/** Everything a player needs to play an episode, in every version it has. */
export interface Playback {
  animeId: string;
  seasonId: string;
  /** Position within the season, from 1. */
  episode: number;
  /** When the stream URLs stop working, as an ISO 8601 timestamp. */
  expiresAt: string;
  /**
   * Every version a provider can stream right now: dub before sub before
   * raw, so the first is the one to play by default.
   */
  media: PlaybackMedia[];
}

export const PlaybackRequestSchema = z.object({
  animeId: z.string().min(1),
  seasonId: z.string().min(1),
  /** Position within the season, from 1. */
  episode: z.number().int().positive()
});

export type PlaybackRequest = z.input<typeof PlaybackRequestSchema>;

export interface PlaybackOptions {
  /**
   * Absolute URL of the proxy route that serves stream tokens, such as
   * `https://api.example/v1/streams`. Each URL in the playback is a token
   * under it.
   */
  streamBaseUrl: string;
}

/**
 * Tried when no provider that lists languages truthfully lists the episode,
 * since the others may still stream it.
 */
const fallbackVersions: readonly EpisodeVersion[] = [
  {
    language: "dub",
    locale: servedLocale
  },
  {
    language: "sub",
    locale: servedLocale
  }
];

const qualityRank: Record<StreamQuality, number> = {
  auto: 0,
  "1080p": 1,
  "720p": 2,
  "480p": 3,
  "360p": 4
};

/**
 * Resolves playable streams for one episode in every English version
 * providers offer it in, such as dub and sub, at once. Each version comes
 * from the first English provider that can stream it; a version none can
 * stream right now is left out. A sub keeps every subtitle track its
 * provider has, and always has English ones: a provider with English tracks
 * is preferred, and otherwise the first whose English subtitles are burned in
 * is served, marked `hardsub`.
 *
 * Each version carries the opening and ending its provider's player ships
 * with the stream, so they need no requests of their own.
 *
 * Upstream URLs are never exposed; clients receive proxy URLs so upstream
 * headers and hosts stay on the server. They expire with their tokens.
 *
 * @throws {@link InvalidInputError} when the request fails {@link PlaybackRequestSchema}.
 * @throws {@link SeasonNotFoundError} when the season does not exist, or
 *   does not belong to the series.
 * @throws {@link EpisodeNotFoundError} when the season has no such episode,
 *   the episode is an extra only TMDB lists, or no provider lists it.
 * @throws {@link PlaybackUnavailableError} when providers list the episode but
 *   none can currently stream any version of it.
 */
export async function resolvePlayback(request: PlaybackRequest, options: PlaybackOptions): Promise<Playback> {
  const parsed = PlaybackRequestSchema.safeParse(request);
  if (!parsed.success) {
    throw new InvalidInputError("Invalid playback request", {
      cause: parsed.error
    });
  }

  const { animeId, seasonId, episode } = parsed.data;
  // Taken before any token is made, so every token outlives it.
  const expiresAt = new Date(Date.now() + tokenLifetimeMs).toISOString();
  const located = await locateEpisode(seasonId, episode, animeId);
  const anime = await getAnime(located.anilistId);
  const offered = await getEpisodeVersions(located);
  const streamUrl = (token: string) => `${options.streamBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(token)}`;

  // Versions share each provider's episode list.
  const lists = new Map<string, Promise<ProviderUnit[]>>();
  const unitsOf = (provider: StreamProvider) => {
    const list = lists.get(provider.id) ?? getProviderUnits(anime, provider);
    lists.set(provider.id, list);
    return list;
  };

  const served = offered.filter((version) => version.locale === null || version.locale === servedLocale);
  const results = await Promise.all(
    (served.length > 0 ? served : fallbackVersions).map((version) =>
      resolveVersion(version, located.anilistEpisode, unitsOf, streamUrl)
    )
  );
  const media = results.flatMap((result) => (result.version ? [result.version] : []));
  if (media.length > 0) {
    return {
      animeId,
      seasonId,
      episode,
      expiresAt,
      media
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
  unitsOf: (provider: StreamProvider) => Promise<ProviderUnit[]>,
  streamUrl: (token: string) => string
): Promise<{
  version: PlaybackMedia | null;
  /** Whether a provider serving the locale lists the episode. */
  listed: boolean;
  attempts: ProviderAttempt[];
}> {
  const attempts: ProviderAttempt[] = [];
  const fail = (provider: StreamProvider, reason: string) =>
    attempts.push({
      provider: provider.id,
      reason: `${language}${locale ? ` (${locale})` : ""}: ${reason}`
    });
  let listed = false;
  let hardsubbed: PlaybackMedia | null = null;

  for (const provider of streamProviders) {
    if (provider.locale !== servedLocale || (locale !== null && provider.locale !== locale)) {
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

      const stream = await provider.resolveStream(unit.id, language);
      const media = toPlaybackMedia(stream.videos, streamUrl);
      const version = {
        audio: language,
        locale,
        provider: provider.id,
        hardsub: language === "sub" && !media.subtitles.some(isServedSubtitle),
        sources: media.sources,
        // Providers hand a dub the sub's subtitles: a translation of the
        // Japanese dialogue, which does not match the English audio.
        subtitles: language === "sub" ? media.subtitles : [],
        skipSegments: stream.skipSegments
      };

      // A sub without English tracks has them burned in. Later providers may
      // serve tracks, which players can style and turn off, so they are tried
      // first, and this one is kept to fall back on.
      if (version.hardsub) {
        fail(provider, "Subtitles are burned in");
        hardsubbed ??= version;
        continue;
      }

      return {
        version,
        listed,
        attempts
      };
    } catch (cause) {
      fail(provider, cause instanceof Error ? cause.message : "Provider failed");
    }
  }

  return {
    version: hardsubbed,
    listed,
    attempts
  };
}

function toPlaybackMedia(videos: ProviderVideo[], streamUrl: (token: string) => string) {
  const sources = [...videos]
    .sort((left, right) => qualityRank[left.quality] - qualityRank[right.quality])
    .map((video) => ({
      url: streamUrl(createStreamToken(video.url, video.format === "hls" ? "playlist" : "file", video.headers)),
      format: video.format,
      quality: video.quality
    }));

  // Providers attach the same subtitle tracks to every quality variant.
  const subtitles = new Map<string, PlaybackSubtitle>();
  for (const video of videos) {
    for (const track of video.subtitles) {
      if (!subtitles.has(track.url)) {
        subtitles.set(track.url, {
          url: streamUrl(createStreamToken(track.url, "subtitle", video.headers)),
          language: track.language,
          label: languageName(track.language) ?? track.label,
          format: track.format
        });
      }
    }
  }

  return {
    sources,
    subtitles: [...subtitles.values()].sort(
      (left, right) => Number(isServedSubtitle(right)) - Number(isServedSubtitle(left)) || left.label.localeCompare(right.label)
    )
  };
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

/**
 * A language's English name, such as `Brazilian Portuguese` for `pt-BR`, in
 * place of labels providers spell as `Portuguese (- Portuguese(Brazil))`.
 */
function languageName(tag: string) {
  try {
    const name = languageNames.of(tag);
    return name && name !== tag ? name : null;
  } catch {
    return null;
  }
}
