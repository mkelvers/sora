import { AllmangaProvider, AnimeParadiseProvider, HttpClient, MappingClient } from "anime-sdk";

import { AniKotoStreamProvider } from "./anikoto";
import { recordingCalls } from "./calls";
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
const mappingClient = new MappingClient(providerHttp, {
  // Anify's API redirects to itself, so every lookup spent about 15s failing
  // before the mapping fell through to the other sources.
  disableAnify: true
});

/**
 * The only locale Sora serves: dubs in English, and subs that always have
 * English subtitles. Providers in other locales are never used; a sub's
 * tracks in other languages are kept alongside the English ones.
 */
export const servedLocale = "en";

/** Whether a subtitle track is in {@link servedLocale}, by its BCP 47 tag or its label. */
export function isServedSubtitle(track: { language: string; label: string }) {
  const language = track.language.trim().toLowerCase();
  return /^en(?:-|_|$)/.test(language) || language.startsWith("english") || /^english\b/i.test(track.label.trim());
}

/** AniKoto, which playback tries first. An episode neither it nor TMDB lists is not shown. */
export const aniKoto = recordingCalls(
  new AniKotoStreamProvider(providerHttp, {
    locale: "en",
    listsLanguages: true
  })
);

/**
 * Every anime stream provider, in the order playback tries them.
 *
 * AniKoto comes first: it has the widest catalogue with sub and dub. Scrapers
 * break without notice, so playback falls through the rest in turn, and every
 * call is recorded in `provider_calls` to show when one has broken.
 */
export const streamProviders: readonly StreamProvider[] = [
  aniKoto,
  ...[
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
  ].map((provider) => recordingCalls(provider))
];
