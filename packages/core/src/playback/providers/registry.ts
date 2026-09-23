import {
  AllmangaProvider,
  AnimeParadiseProvider,
  GogoanimeProvider,
  GoyabuProvider,
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

/**
 * Every anime stream provider, in the order playback tries them.
 *
 * AniKoto comes first: it has the widest catalogue with sub and dub. Scrapers
 * break without notice, so playback falls through the rest in turn. Goyabu is
 * last because it only carries Brazilian Portuguese dubs.
 */
export const streamProviders: readonly BaseProvider[] = [
  new AniKotoStreamProvider(http),
  new AnimeParadiseProvider(http),
  new MegaPlayStreamProvider(http),
  new AllmangaProvider(http),
  new GogoanimeProvider(http),
  new GoyabuProvider(http)
];
