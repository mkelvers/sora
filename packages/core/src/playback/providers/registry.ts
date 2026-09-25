import { AllmangaProvider, AnimeParadiseProvider, HttpClient, MappingClient } from "anime-sdk";

import { AniKotoStreamProvider } from "./anikoto";
import { MegaPlayStreamProvider } from "./megaplay";
import type { StreamProvider } from "./provider";
import { SdkStreamProvider } from "./sdk";

/**
 * Shared HTTP client for every scraper, so per-host rate limits and retries
 * apply across all requests from this process.
 */
const providerHttp = new HttpClient({
  timeoutMs: 20_000,
  rateLimits: {
    // AniKoto's API allows 60 requests a minute per IP.
    "anikotoapi.site": {
      capacity: 55,
      intervalMs: 60_000
    }
  }
});

/** Matches AniList entries to provider catalogues. Results are persisted separately. */
const mappingClient = new MappingClient(providerHttp);

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

/**
 * Every anime stream provider, in the order playback tries them.
 *
 * AniKoto comes first: it has the widest catalogue with sub and dub. Scrapers
 * break without notice, so playback falls through the rest in turn.
 */
export const streamProviders: readonly StreamProvider[] = [
  new AniKotoStreamProvider(providerHttp, {
    locale: "en",
    listsLanguages: true
  }),
  new SdkStreamProvider(new AnimeParadiseProvider(providerHttp), mappingClient, {
    locale: "en",
    listsLanguages: true
  }),
  // MegaPlay's lists are made up from AniList's episode count and claim sub
  // and dub for every episode.
  new MegaPlayStreamProvider(providerHttp, mappingClient, {
    locale: "en",
    listsLanguages: false
  }),
  new SdkStreamProvider(new AllmangaProvider(providerHttp), mappingClient, {
    locale: "en",
    listsLanguages: true
  })
];
