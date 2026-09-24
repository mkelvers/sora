import {
  AllmangaProvider,
  AnimeParadiseProvider,
  HttpClient,
  MappingClient,
  type BaseProvider
} from "anime-sdk";

import { AniKotoStreamProvider } from "./anikoto";
import { MegaPlayStreamProvider } from "./megaplay";

/**
 * Shared HTTP client for every scraper, so per-host rate limits and retries
 * apply across all requests from this process.
 */
const http = new HttpClient({
  timeoutMs: 20_000
});

/** Matches AniList entries to provider catalogues. Results are persisted separately. */
export const mappingClient = new MappingClient(http);

/** AniKoto, the first provider playback tries. */
export const aniKotoProvider = new AniKotoStreamProvider(http);

/**
 * The only language Sora serves: dubs in English, and English subtitles.
 * Providers in other locales are never used, and other subtitle tracks are
 * dropped.
 */
export const servedLocale = "en";

/** Whether a subtitle track is in {@link servedLocale}, by its BCP 47 tag or its label. */
export function isServedSubtitle(track: { language: string; label: string }) {
  const language = track.language.trim().toLowerCase();
  return /^en(?:-|_|$)/.test(language) || language.startsWith("english") || /^english\b/i.test(track.label.trim());
}

/** A stream provider and what its streams and episode lists can be trusted for. */
export interface StreamProvider {
  provider: BaseProvider;
  /**
   * BCP 47 language of the provider's dubbed audio and of its subtitles. Each
   * provider serves one: a site's subtitles are for its own audience.
   */
  locale: string;
  /**
   * Whether the provider's episode lists say truthfully which of sub, dub, and
   * raw each episode has. MegaPlay's lists are made up from AniList's episode
   * count and claim sub and dub for every episode.
   */
  listsLanguages: boolean;
}

/**
 * Every anime stream provider, in the order playback tries them.
 *
 * AniKoto comes first: it has the widest catalogue with sub and dub. Scrapers
 * break without notice, so playback falls through the rest in turn.
 */
export const streamProviders: readonly StreamProvider[] = [
  {
    provider: aniKotoProvider,
    locale: "en",
    listsLanguages: true
  },
  {
    provider: new AnimeParadiseProvider(http),
    locale: "en",
    listsLanguages: true
  },
  {
    provider: new MegaPlayStreamProvider(http),
    locale: "en",
    listsLanguages: false
  },
  {
    provider: new AllmangaProvider(http),
    locale: "en",
    listsLanguages: true
  }
];
