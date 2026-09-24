import type { AppType } from "@sora/api";
import type { BrowseQuery, Page } from "@sora/core/catalog";
import type { Playback, SkipSegment } from "@sora/core/playback";
import type { ScheduledEpisode, SeasonEpisode, Series, SeriesCard } from "@sora/core/series";
import { hc, type ClientResponse } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";

import { SoraError } from "./error";

/** How to reach the API. */
export interface SoraOptions {
  /** The API's base URL, without the version, such as `https://api.example.com`. */
  baseUrl: string;
  /** Replaces the global `fetch`, for example to add caching or tracing. */
  fetch?: (input: Request | string | URL, init?: RequestInit) => Promise<Response>;
  /** Headers sent with every request. */
  headers?: Record<string, string>;
}

/**
 * A typed client for the Sora API.
 *
 * Every method maps to one `/v1` route and returns the core's models. A
 * failed request throws {@link SoraError}.
 *
 * @example
 * ```ts
 * const sora = new Sora({ baseUrl: "https://api.example.com" });
 * const { items } = await sora.browse({ search: "tensura" });
 * const series = await sora.series(items[0].id);
 * const episodes = await sora.episodes(series.seasons[0].id);
 * const playback = await sora.playback(series.seasons[0].id, 1);
 * const src = sora.streamUrl(playback.sources[0].token);
 * ```
 */
export class Sora {
  readonly #api: ReturnType<typeof hc<AppType>>["v1"];
  readonly #baseUrl: string;

  constructor(options: SoraOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#api = hc<AppType>(this.#baseUrl, {
      fetch: options.fetch,
      headers: options.headers
    }).v1;
  }

  /**
   * Searches and browses titles, one card per title. A page can hold fewer
   * cards than `perPage` when several AniList entries belong to one title.
   */
  browse(query: BrowseQuery = {}): Promise<Page<SeriesCard>> {
    return read(
      this.#api.anime.$get({
        query: {
          search: query.search,
          sort: query.sort,
          season: query.season,
          seasonYear: query.seasonYear?.toString(),
          format: query.format?.join(","),
          status: query.status,
          genres: query.genres?.join(","),
          page: query.page?.toString(),
          perPage: query.perPage?.toString()
        }
      })
    );
  }

  /** Loads a title's page: details, artwork, seasons, the next episode, and related titles. */
  series(seriesId: string): Promise<Series> {
    return read(
      this.#api.anime[":animeId"].$get({
        param: {
          animeId: seriesId
        }
      })
    );
  }

  /** Lists a season's episodes, numbered from 1. */
  async episodes(seasonId: string): Promise<SeasonEpisode[]> {
    const { items } = await read(
      this.#api.seasons[":seasonId"].episodes.$get({
        param: {
          seasonId
        }
      })
    );
    return items;
  }

  /**
   * Resolves streams for an episode. Stream tokens expire: resolve again
   * rather than storing them, and turn them into URLs with {@link streamUrl}.
   */
  playback(
    seasonId: string,
    episode: number,
    options: {
      language?: Playback["language"];
    } = {}
  ): Promise<Playback> {
    return read(
      this.#api.seasons[":seasonId"].episodes[":episode"].playback.$get({
        param: {
          seasonId,
          episode: episode.toString()
        },
        query: {
          language: options.language
        }
      })
    );
  }

  /**
   * Opening, ending, and recap times, crowd-sourced from AniSkip.
   *
   * @param options.durationSeconds - The playing stream's duration; narrows
   *   results to encodes of similar length.
   */
  async skipTimes(
    seasonId: string,
    episode: number,
    options: {
      durationSeconds?: number;
    } = {}
  ): Promise<SkipSegment[]> {
    const { items } = await read(
      this.#api.seasons[":seasonId"].episodes[":episode"]["skip-times"].$get({
        param: {
          seasonId,
          episode: episode.toString()
        },
        query: {
          duration: options.durationSeconds?.toString()
        }
      })
    );
    return items;
  }

  /** Genre names accepted by {@link browse}. */
  async genres(): Promise<string[]> {
    const { items } = await read(this.#api.genres.$get());
    return items;
  }

  /** Episodes airing in a window of up to 14 days, in broadcast order. Defaults to the next 7 days. */
  async schedule(
    window: {
      from?: Date;
      until?: Date;
    } = {}
  ): Promise<ScheduledEpisode[]> {
    const { items } = await read(
      this.#api.schedule.$get({
        query: {
          from: window.from?.toISOString(),
          until: window.until?.toISOString()
        }
      })
    );
    return items;
  }

  /**
   * The URL a player fetches a stream token from. Players fetch it directly,
   * from any origin; no headers are needed.
   */
  streamUrl(token: string): string {
    return `${this.#baseUrl}/v1/streams/${encodeURIComponent(token)}`;
  }
}

/** The body of a route's successful (2xx) response. */
type SuccessBody<TResponse> = TResponse extends ClientResponse<infer TBody, infer TStatus, "json">
  ? TStatus extends SuccessStatusCode
    ? TBody
    : never
  : never;

/** Waits for a response and returns its successful body, or throws {@link SoraError}. */
async function read<TResponse extends ClientResponse<unknown, number, string>>(pending: Promise<TResponse>): Promise<SuccessBody<TResponse>> {
  const response = await pending;
  if (!response.ok) {
    throw await SoraError.from(response);
  }

  return (await response.json()) as SuccessBody<TResponse>;
}
