import type { AppType } from "@sora/api";
import type { BrowseQuery, Page } from "@sora/core/catalog";
import type { EpisodeVersion, Playback, SkipSegment } from "@sora/core/playback";
import type { ScheduledEpisode, SeasonEpisode, Series, SeriesCard } from "@sora/core/series";
import { hc, type ClientResponse } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";

import { SoraError } from "./error";

/** Filters and sorting for {@link Sora.browse} and {@link Sora.search}. */
export type BrowseFilters = Omit<BrowseQuery, "search">;

/** Options every request accepts. */
export interface RequestOptions {
  /** Aborts the request, for example `AbortSignal.timeout(10_000)`. */
  signal?: AbortSignal;
}

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
 * failed request throws {@link SoraError}; an aborted one rejects with the
 * signal's reason, such as a `TimeoutError`.
 *
 * @example
 * ```ts
 * const sora = new Sora({ baseUrl: "https://api.example.com" });
 * const { items } = await sora.search("tensura");
 * const series = await sora.series(items[0].id);
 * const episodes = await sora.episodes(series.seasons[0].id);
 * const playback = await sora.playback(series.seasons[0].id, 1, { signal: AbortSignal.timeout(15_000) });
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
   * Browses titles, one card per title. A page can hold fewer cards than
   * `perPage` when several AniList entries belong to one title.
   */
  browse(filters: BrowseFilters = {}, options: RequestOptions = {}): Promise<Page<SeriesCard>> {
    return read(
      this.#api.anime.$get(
        {
          query: filterParams(filters)
        },
        init(options)
      )
    );
  }

  /**
   * Searches titles for `text`, best match first unless `filters.sort` is
   * given. One card per title, as {@link browse} returns them.
   */
  search(text: string, filters: BrowseFilters = {}, options: RequestOptions = {}): Promise<Page<SeriesCard>> {
    return read(
      this.#api.search.$get(
        {
          query: {
            q: text,
            ...filterParams(filters)
          }
        },
        init(options)
      )
    );
  }

  /** Loads a title's page: details, artwork, seasons, the next episode, and related titles. */
  series(seriesId: string, options: RequestOptions = {}): Promise<Series> {
    return read(
      this.#api.anime[":animeId"].$get(
        {
          param: {
            animeId: seriesId
          }
        },
        init(options)
      )
    );
  }

  /** Lists a season's episodes, numbered from 1. */
  async episodes(seasonId: string, options: RequestOptions = {}): Promise<SeasonEpisode[]> {
    const { items } = await read(
      this.#api.seasons[":seasonId"].episodes.$get(
        {
          param: {
            seasonId
          }
        },
        init(options)
      )
    );
    return items;
  }

  /**
   * The ways to watch an episode, such as sub with English subtitles or an
   * English dub. Pass a version's `language` and `locale` to
   * {@link playback} to play it.
   */
  async versions(seasonId: string, episode: number, options: RequestOptions = {}): Promise<EpisodeVersion[]> {
    const { items } = await read(
      this.#api.seasons[":seasonId"].episodes[":episode"].versions.$get(
        {
          param: {
            seasonId,
            episode: episode.toString()
          }
        },
        init(options)
      )
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
    options: RequestOptions & {
      language?: Playback["language"];
      /** Language wanted for a dub's audio or a sub's subtitles; `en` unless given. Ignored for raw. */
      locale?: string;
    } = {}
  ): Promise<Playback> {
    return read(
      this.#api.seasons[":seasonId"].episodes[":episode"].playback.$get(
        {
          param: {
            seasonId,
            episode: episode.toString()
          },
          query: {
            language: options.language,
            locale: options.locale
          }
        },
        init(options)
      )
    );
  }

  /**
   * Opening, ending, and recap times from AniKoto, falling back to
   * crowd-sourced AniSkip times when AniKoto has none.
   *
   * @param options.durationSeconds - The playing stream's duration; narrows
   *   AniSkip results to encodes of similar length.
   */
  async skipTimes(
    seasonId: string,
    episode: number,
    options: RequestOptions & {
      durationSeconds?: number;
    } = {}
  ): Promise<SkipSegment[]> {
    const { items } = await read(
      this.#api.seasons[":seasonId"].episodes[":episode"]["skip-times"].$get(
        {
          param: {
            seasonId,
            episode: episode.toString()
          },
          query: {
            duration: options.durationSeconds?.toString()
          }
        },
        init(options)
      )
    );
    return items;
  }

  /** Genre names accepted by {@link browse} and {@link search}. */
  async genres(options: RequestOptions = {}): Promise<string[]> {
    const { items } = await read(this.#api.genres.$get(undefined, init(options)));
    return items;
  }

  /** Episodes airing in a window of up to 14 days, in broadcast order. Defaults to the next 7 days. */
  async schedule(
    window: {
      from?: Date;
      until?: Date;
    } = {},
    options: RequestOptions = {}
  ): Promise<ScheduledEpisode[]> {
    const { items } = await read(
      this.#api.schedule.$get(
        {
          query: {
            from: window.from?.toISOString(),
            until: window.until?.toISOString()
          }
        },
        init(options)
      )
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

/** {@link BrowseFilters} as query parameters, which carry every value as text. */
function filterParams(filters: BrowseFilters) {
  return {
    sort: filters.sort,
    season: filters.season,
    seasonYear: filters.seasonYear?.toString(),
    format: filters.format?.join(","),
    status: filters.status,
    genres: filters.genres?.join(","),
    page: filters.page?.toString(),
    perPage: filters.perPage?.toString()
  };
}

/** Passes a method's {@link RequestOptions} to the underlying request. */
function init(options: RequestOptions) {
  return {
    init: {
      signal: options.signal
    }
  };
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
