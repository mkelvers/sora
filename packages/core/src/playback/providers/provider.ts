import type { Anime } from "../../catalog/models/anime";
import type { ContentLanguage } from "../../series/models";

/** Where an anime is in a provider's catalogue. */
export interface ProviderMatch {
  /** The provider's own ID for the series. */
  mediaId: string;
  /** The provider's title for the series, for checking matches by hand. */
  matchedTitle: string;
  /** How the match was made, such as by ID or by title. */
  method: string;
  /**
   * Provider episodes that belong to earlier parts, for a part the provider
   * files under its prequel: the anime's first episode is the provider's
   * episode `episodeOffset + 1`.
   */
  episodeOffset: number;
}

/** An episode as a provider lists it, numbered as the provider numbers it. */
export interface ProviderEpisode {
  /** The provider's opaque ID for the episode, which {@link StreamProvider.resolveStream} takes. */
  id: string;
  number: number;
  title: string;
  /** The languages the episode has, or `null` when the provider does not say. */
  languages: ContentLanguage[] | null;
  /** Whether the episode is filler, or `null` when the provider does not say. */
  isFiller: boolean | null;
}

/** A skippable span of a stream, in seconds from its start. */
export interface SkipSegment {
  kind: "opening" | "ending";
  start: number;
  end: number;
}

export type StreamQuality = "1080p" | "720p" | "480p" | "360p" | "auto";

export interface ProviderSubtitle {
  url: string;
  /** BCP 47 language tag, for example `en` or `pt-BR`. */
  language: string;
  label: string;
  format: "vtt" | "srt" | "ass" | null;
}

/** One upstream video of an episode. */
export interface ProviderVideo {
  url: string;
  format: "hls" | "mp4";
  quality: StreamQuality;
  /** Headers the upstream host requires, such as a referer. */
  headers: Record<string, string>;
  subtitles: ProviderSubtitle[];
}

/** What a provider streams for one episode in one language. */
export interface ProviderStream {
  /** Never empty. */
  videos: ProviderVideo[];
  /** Opening and ending, in playback order, timed against these videos. Empty when the provider reports none. */
  skipSegments: SkipSegment[];
}

/**
 * A source of anime streams, such as a scraper for one site.
 *
 * Everything particular to a provider, from how its catalogue is matched to
 * how its player hands out sources, stays behind this interface. Playback and
 * the scheduler see only these methods and Sora's own types.
 */
export interface StreamProvider {
  /** Stable ID, stored with the provider's mappings and episode lists. */
  readonly id: string;
  /**
   * BCP 47 language of the provider's dubbed audio and of its subtitles. Each
   * provider serves one: a site's subtitles are for its own audience.
   */
  readonly locale: string;
  /** Whether {@link listEpisodes} says truthfully which languages each episode has. */
  readonly listsLanguages: boolean;

  /**
   * Finds an anime in the provider's catalogue.
   *
   * @returns `null` when the provider has no confident match.
   * @throws when the provider cannot be asked.
   */
  findMedia(anime: Anime): Promise<ProviderMatch | null>;

  /**
   * Lists the episodes of a series {@link findMedia} matched, in the
   * provider's numbering.
   *
   * @throws when the provider cannot be asked.
   */
  listEpisodes(mediaId: string): Promise<ProviderEpisode[]>;

  /**
   * Resolves one episode in one language into upstream videos.
   *
   * @param episodeId - A {@link ProviderEpisode.id} from {@link listEpisodes}.
   * @throws when the provider has no stream for it or cannot be asked.
   */
  resolveStream(episodeId: string, language: ContentLanguage): Promise<ProviderStream>;

  /**
   * Brings a provider's local copy of its catalogue up to date, for
   * providers that match against one. The scheduler calls it hourly, and
   * weekly with `full` to also drop what the provider removed.
   *
   * @returns A summary for the scheduler's log.
   */
  syncCatalog?(options: { full: boolean }): Promise<string>;
}
