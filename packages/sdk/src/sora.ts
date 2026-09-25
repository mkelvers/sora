import type {
  AppType,
  CountMeta,
  Envelope,
  PageMeta,
  PlaybackMedia,
  PlaybackMeta,
  ScheduledEpisode,
  ScheduleMeta,
  Season,
  SeasonEpisode,
  SeasonEpisodesMeta,
  SeasonMeta,
  Series,
  SeriesCard,
  SeriesMeta,
  SeriesWithEpisodes
} from "@sora/api";
import type { BrowseQuery } from "@sora/core/catalog";
import { hc, type ClientResponse } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";

import { SoraError } from "./error";

/** Filters and sorting for {@link SoraClient.browse} and {@link SoraClient.search}, named as the API's query parameters. */
export interface BrowseParams {
  sort?: BrowseQuery["sort"];
  season?: BrowseQuery["season"];
  season_year?: number;
  format?: BrowseQuery["format"];
  status?: BrowseQuery["status"];
  genres?: string[];
  page?: number;
  per_page?: number;
}

/** Extra data for {@link SoraClient.series}. */
export interface SeriesParams {
  /**
   * Whether every season carries its episodes, so a title's page needs one
   * request.
   *
   * @defaultValue false
   */
  episodes?: boolean;
}

/** The window for {@link SoraClient.schedule}: up to 14 days. */
export interface ScheduleParams {
  /** @defaultValue now */
  from?: Date;
  /** @defaultValue 7 days after `from` */
  until?: Date;
}

/**
 * Artwork to choose for a title with {@link SoraClient.updateArtwork}. An
 * HTTPS URL replaces the image, `null` goes back to the one Sora chose, and
 * an omitted field stays as it is.
 */
export interface ArtworkChanges {
  poster_url?: string | null;
  backdrop_url?: string | null;
  logo_url?: string | null;
}

/** A season, under the title it belongs to. */
export interface SeasonRef {
  seriesId: string;
  seasonId: string;
}

/** An episode, by its season and its position in it. */
export interface EpisodeRef {
  seasonId: string;
  /** Position within the season, from 1, as {@link SeasonEpisode.number}. */
  number: number;
}

/** What every method accepts after its main input. */
export interface RequestOptions<TParams = never> {
  /** The method's extra parameters, filters, and sorting. */
  params?: TParams;
  /**
   * Returns `{ results, meta }` instead of the results alone, for paging
   * (`meta.next`), when stream URLs expire, and the like.
   *
   * @defaultValue false
   */
  meta?: boolean;
  /** Aborts the request, for example `AbortSignal.timeout(10_000)`. */
  signal?: AbortSignal;
}

/** The type of `TObject[TKey]`, or `undefined` when `TObject` has no such key. */
type Field<TObject, TKey extends string> = TObject extends object
  ? TKey extends keyof TObject
    ? TObject[TKey]
    : undefined
  : undefined;

/**
 * What a method resolves to: its results, or with `meta: true` the results
 * and their meta. Options whose `meta` is only known as a `boolean` get either.
 */
export type Returned<TOptions, TResults, TMeta> = [Field<TOptions, "meta">] extends [true]
  ? Envelope<TResults, TMeta>
  : [Field<TOptions, "meta">] extends [false | undefined]
    ? TResults
    : TResults | Envelope<TResults, TMeta>;

/**
 * The title {@link SoraClient.series} resolves to: with `episodes: true`,
 * every season carries its episodes.
 */
export type SeriesOf<TOptions> = [Field<Field<TOptions, "params">, "episodes">] extends [true]
  ? SeriesWithEpisodes
  : [Field<Field<TOptions, "params">, "episodes">] extends [false | undefined]
    ? Series
    : Series | SeriesWithEpisodes;

/** How to reach the API. */
export interface SoraClientOptions {
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
 * Every method takes its main input first, then {@link RequestOptions}, and
 * resolves to the results alone; pass `meta: true` for `{ results, meta }`.
 * Every field is in snake_case, as the API spells it. A failed request
 * throws {@link SoraError}; an aborted one rejects with the signal's reason,
 * such as a `TimeoutError`.
 *
 * @example
 * ```ts
 * const sora = new SoraClient({ baseUrl: "http://localhost:4000" });
 *
 * const results = await sora.search("Frieren");
 * const series = await sora.series(results[0].id, { params: { episodes: true } });
 * const season = series.seasons[0];
 * const media = await sora.playback({ seasonId: season.id, number: season.episodes[0].number });
 *
 * const { meta } = await sora.search("Frieren", { params: { page: 2 }, meta: true });
 * meta.has_next_page;
 * ```
 */
export class SoraClient {
  readonly #api: ReturnType<typeof hc<AppType>>["v1"];

  constructor(options: SoraClientOptions) {
    this.#api = hc<AppType>(options.baseUrl.replace(/\/+$/, ""), {
      fetch: options.fetch,
      headers: options.headers
    }).v1;
  }

  /**
   * Browses titles, one card per title. A page can hold fewer cards than
   * `per_page` when several AniList entries belong to one title.
   */
  async browse<const TOptions extends RequestOptions<BrowseParams> = {}>(
    options?: TOptions
  ): Promise<Returned<TOptions, SeriesCard[], PageMeta>> {
    const body: Envelope<SeriesCard[], PageMeta> = await read(
      this.#api.anime.$get(
        {
          query: browseQuery(options?.params)
        },
        init(options)
      )
    );
    return unwrap(body, options);
  }

  /**
   * Searches titles for `query`, best match first unless `params.sort` is
   * given. One card per title, as {@link browse} returns them.
   */
  async search<const TOptions extends RequestOptions<BrowseParams> = {}>(
    query: string,
    options?: TOptions
  ): Promise<Returned<TOptions, SeriesCard[], PageMeta>> {
    const body: Envelope<SeriesCard[], PageMeta> = await read(
      this.#api.search.$get(
        {
          query: {
            q: query,
            ...browseQuery(options?.params)
          }
        },
        init(options)
      )
    );
    return unwrap(body, options);
  }

  /**
   * Loads a title's page: details, artwork, seasons, the next episode, and
   * related titles; with `params.episodes`, every season's episodes too.
   */
  async series<const TOptions extends RequestOptions<SeriesParams> = {}>(
    seriesId: string,
    options?: TOptions
  ): Promise<Returned<TOptions, SeriesOf<TOptions>, SeriesMeta>> {
    const body: Envelope<Series | SeriesWithEpisodes, SeriesMeta> = await read(
      this.#api.anime[":anime_id"].$get(
        {
          param: {
            anime_id: seriesId
          },
          query: {
            episodes: options?.params?.episodes ? "true" : undefined
          }
        },
        init(options)
      )
    );
    return unwrap(body as Envelope<SeriesOf<TOptions>, SeriesMeta>, options);
  }

  /**
   * Chooses a title's poster, backdrop, or logo for everyone. The choice is
   * kept when the title is laid out again. Resolves to the title with its
   * new artwork.
   */
  async updateArtwork<const TOptions extends RequestOptions = {}>(
    seriesId: string,
    changes: ArtworkChanges,
    options?: TOptions
  ): Promise<Returned<TOptions, Series, SeriesMeta>> {
    const body: Envelope<Series, SeriesMeta> = await read(
      this.#api.anime[":anime_id"].artwork.$patch(
        {
          param: {
            anime_id: seriesId
          },
          json: changes
        },
        init(options)
      )
    );
    return unwrap(body, options);
  }

  /** Loads one season of a title. */
  async season<const TOptions extends RequestOptions = {}>(
    season: SeasonRef,
    options?: TOptions
  ): Promise<Returned<TOptions, Season, SeasonMeta>> {
    const body: Envelope<Season, SeasonMeta> = await read(
      this.#api.anime[":anime_id"].seasons[":season_id"].$get(
        {
          param: {
            anime_id: season.seriesId,
            season_id: season.seasonId
          }
        },
        init(options)
      )
    );
    return unwrap(body, options);
  }

  /**
   * Lists a season's episodes, numbered from 1. {@link series} with
   * `params.episodes` returns every season's at once.
   */
  async episodes<const TOptions extends RequestOptions = {}>(
    season: SeasonRef,
    options?: TOptions
  ): Promise<Returned<TOptions, SeasonEpisode[], SeasonEpisodesMeta>> {
    const body: Envelope<SeasonEpisode[], SeasonEpisodesMeta> = await read(
      this.#api.anime[":anime_id"].seasons[":season_id"].episodes.$get(
        {
          param: {
            anime_id: season.seriesId,
            season_id: season.seasonId
          }
        },
        init(options)
      )
    );
    return unwrap(body, options);
  }

  /**
   * Resolves everything needed to play an episode: every version at once,
   * such as sub and dub, each with its sources, subtitles, and skip
   * segments, dub first. Source and subtitle URLs go straight to the player;
   * they expire at `meta.expires_at`, so resolve again rather than storing
   * them. `meta.next` and `meta.previous` are the playbacks either side.
   */
  async playback<const TOptions extends RequestOptions = {}>(
    episode: EpisodeRef,
    options?: TOptions
  ): Promise<Returned<TOptions, PlaybackMedia[], PlaybackMeta>> {
    const body: Envelope<PlaybackMedia[], PlaybackMeta> = await read(
      this.#api.seasons[":season_id"].episodes[":episode"].playback.$get(
        {
          param: {
            season_id: episode.seasonId,
            episode: episode.number.toString()
          }
        },
        init(options)
      )
    );
    return unwrap(body, options);
  }

  /** Genre names accepted by `params.genres` of {@link browse} and {@link search}. */
  async genres<const TOptions extends RequestOptions = {}>(
    options?: TOptions
  ): Promise<Returned<TOptions, string[], CountMeta>> {
    const body: Envelope<string[], CountMeta> = await read(this.#api.genres.$get(undefined, init(options)));
    return unwrap(body, options);
  }

  /** Episodes airing in a window of up to 14 days, in broadcast order. Defaults to the next 7 days. */
  async schedule<const TOptions extends RequestOptions<ScheduleParams> = {}>(
    options?: TOptions
  ): Promise<Returned<TOptions, ScheduledEpisode[], ScheduleMeta>> {
    const body: Envelope<ScheduledEpisode[], ScheduleMeta> = await read(
      this.#api.schedule.$get(
        {
          query: {
            from: options?.params?.from?.toISOString(),
            until: options?.params?.until?.toISOString()
          }
        },
        init(options)
      )
    );
    return unwrap(body, options);
  }
}

/** {@link BrowseParams} as query parameters, which carry every value as text. */
function browseQuery(params: BrowseParams = {}) {
  return {
    sort: params.sort,
    season: params.season,
    season_year: params.season_year?.toString(),
    format: params.format?.join(","),
    status: params.status,
    genres: params.genres?.join(","),
    page: params.page?.toString(),
    per_page: params.per_page?.toString()
  };
}

/** Passes a method's {@link RequestOptions} to the underlying request. */
function init(options: RequestOptions<unknown> | undefined) {
  return {
    init: {
      signal: options?.signal
    }
  };
}

/** A body's results, or the whole body when the caller asked for its meta. */
function unwrap<TOptions extends RequestOptions<unknown>, TResults, TMeta>(
  body: Envelope<TResults, TMeta>,
  options: TOptions | undefined
): Returned<TOptions, TResults, TMeta> {
  return (options?.meta ? body : body.results) as Returned<TOptions, TResults, TMeta>;
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
