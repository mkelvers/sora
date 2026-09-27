import type {
  AppType,
  ContinueWatchingItem,
  CountMeta,
  Envelope,
  PageMeta,
  PlaybackMedia,
  PlaybackMeta,
  Profile,
  ScheduledEpisode,
  ScheduleMeta,
  Season,
  SeasonEpisode,
  SeasonEpisodesMeta,
  SeasonMeta,
  Series,
  SeriesCard,
  SeriesImage,
  SeriesMeta,
  SeriesWithEpisodes,
  TitleProgress,
  TitleProgressMeta
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

/** An account's credentials for {@link SoraClient.signIn}. */
export interface SignIn {
  email: string;
  password: string;
}

/**
 * A signed-in session. Send `token` with every request that needs an account,
 * as an `Authorization: Bearer <token>` header in {@link SoraClientOptions.headers}.
 */
export interface Session {
  token: string;
  account: {
    id: string;
    name: string;
    email: string;
  };
}

/** A profile's name and tile color, for {@link SoraClient.createProfile} and {@link SoraClient.updateProfile}. */
export interface ProfileInput {
  name: string;
  /** A hex color such as `#4f7cff`; picked from a palette when omitted. */
  color?: string;
  /** A DiceBear seed for the avatar; the profile's ID when omitted. */
  avatar?: string;
}

/** Filters for {@link SoraClient.continueWatching}. */
export interface ContinueWatchingParams {
  /** Only this title, for a title's page: at most one entry. */
  series_id?: string;
}

/** A playback position for {@link SoraClient.recordProgress}. */
export interface ProgressUpdate {
  season_id: string;
  /** Position within the season, from 1. */
  episode: number;
  position_seconds: number;
  duration_seconds: number;
  /** Marks the episode watched or unwatched; derived from the position when omitted. */
  completed?: boolean;
  /** When the player was at this position; later events win. @defaultValue now */
  event_at?: Date;
}

/** Filters and sorting for {@link SoraClient.images}. */
export interface ImagesParams {
  /** Only these types; every type when omitted. */
  type?: SeriesImage["type"][];
  /** Only these ISO 639-1 languages, `null` meaning textless; every language when omitted. */
  language?: (string | null)[];
  /**
   * `votes`: TMDB users' rating, weighted by how many voted, then size.
   * `quality`: the largest original first, then votes.
   *
   * @defaultValue "votes"
   */
  sort?: "votes" | "quality";
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
  readonly #options: SoraClientOptions;

  constructor(options: SoraClientOptions) {
    this.#options = {
      ...options,
      baseUrl: options.baseUrl.replace(/\/+$/, "")
    };
    this.#api = hc<AppType>(this.#options.baseUrl, {
      fetch: options.fetch,
      headers: options.headers
    }).v1;
  }

  /**
   * Signs an account in.
   *
   * @throws {@link SoraError} with code `INVALID_EMAIL_OR_PASSWORD` when the
   *   credentials are wrong.
   */
  signIn(credentials: SignIn, options?: RequestOptions): Promise<Session> {
    return this.#auth("sign-in/email", credentials, options);
  }

  /** Ends the session this client's token belongs to. */
  async signOut(options?: RequestOptions): Promise<void> {
    await this.#auth("sign-out", {}, options);
  }

  /** Lists the signed-in account's profiles, oldest first. */
  async profiles<const TOptions extends RequestOptions = {}>(options?: TOptions): Promise<Returned<TOptions, Profile[], CountMeta>> {
    const body: Envelope<Profile[], CountMeta> = await read(this.#api.profiles.$get(undefined, init(options)));
    return unwrap(body, options);
  }

  /** Adds a profile to the signed-in account; there is no limit. */
  async createProfile(input: ProfileInput, options?: RequestOptions): Promise<Profile> {
    const body = await read(
      this.#api.profiles.$post(
        {
          json: input
        },
        init(options)
      )
    );
    return body.results;
  }

  /** Renames or recolors one of the signed-in account's profiles. */
  async updateProfile(profileId: string, changes: Partial<ProfileInput>, options?: RequestOptions): Promise<Profile> {
    const body = await read(
      this.#api.profiles[":profile_id"].$patch(
        {
          param: {
            profile_id: profileId
          },
          json: changes
        },
        init(options)
      )
    );
    return body.results;
  }

  /** Deletes a profile with its progress and watchlist. */
  async deleteProfile(profileId: string, options?: RequestOptions): Promise<void> {
    await send(
      this.#api.profiles[":profile_id"].$delete(
        {
          param: {
            profile_id: profileId
          }
        },
        init(options)
      )
    );
  }

  /**
   * The titles a profile is part-way through, most recent first, each with the
   * episode and position to resume.
   */
  async continueWatching<const TOptions extends RequestOptions<ContinueWatchingParams> = {}>(
    profileId: string,
    options?: TOptions
  ): Promise<Returned<TOptions, ContinueWatchingItem[], CountMeta>> {
    const body: Envelope<ContinueWatchingItem[], CountMeta> = await read(
      this.#api.profiles[":profile_id"]["continue-watching"].$get(
        {
          param: {
            profile_id: profileId
          },
          query: {
            series_id: options?.params?.series_id
          }
        },
        init(options)
      )
    );
    return unwrap(body, options);
  }

  /**
   * Titles a profile has not seen that it may like, best fit first, from
   * what it has played and listed. Empty for a profile with no history.
   */
  async recommendations<const TOptions extends RequestOptions = {}>(
    profileId: string,
    options?: TOptions
  ): Promise<Returned<TOptions, SeriesCard[], CountMeta>> {
    const body: Envelope<SeriesCard[], CountMeta> = await read(
      this.#api.profiles[":profile_id"].recommendations.$get(
        {
          param: {
            profile_id: profileId
          }
        },
        init(options)
      )
    );
    return unwrap(body, options);
  }

  /**
   * A profile's progress through a title: the seasons it has watched to the
   * end, and its saved position in every episode it has played. Finishing a
   * season's last episode completes the season and clears its episodes'
   * positions.
   */
  async progress<const TOptions extends RequestOptions = {}>(
    profileId: string,
    seriesId: string,
    options?: TOptions
  ): Promise<Returned<TOptions, TitleProgress, TitleProgressMeta>> {
    const body: Envelope<TitleProgress, TitleProgressMeta> = await read(
      this.#api.profiles[":profile_id"].progress[":series_id"].$get(
        {
          param: {
            profile_id: profileId,
            series_id: seriesId
          }
        },
        init(options)
      )
    );
    return unwrap(body, options);
  }

  /**
   * Saves a playback position. Report it every few seconds while playing, and
   * on pause and exit; an older position than the saved one changes nothing.
   */
  async recordProgress(profileId: string, update: ProgressUpdate, options?: RequestOptions): Promise<void> {
    await send(
      this.#api.profiles[":profile_id"].progress.$put(
        {
          param: {
            profile_id: profileId
          },
          json: {
            ...update,
            event_at: (update.event_at ?? new Date()).toISOString()
          }
        },
        init(options)
      )
    );
  }

  /** Calls one of Better Auth's endpoints under `/v1/auth`, which answer outside the `{ meta, results }` envelope. */
  async #auth(path: string, body: object, options: RequestOptions | undefined): Promise<Session> {
    const response = await (this.#options.fetch ?? fetch)(`${this.#options.baseUrl}/v1/auth/${path}`, {
      method: "POST",
      headers: {
        // Better Auth checks the origin of requests that look like a browser's,
        // as Node's fetch does; this client speaks for the API's own origin.
        // Browsers ignore it and send their own.
        Origin: new URL(this.#options.baseUrl).origin,
        ...this.#options.headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: options?.signal
    });

    const payload = (await response.json().catch(() => null)) as {
      token?: string;
      user?: Session["account"];
      message?: string;
      code?: string;
    } | null;

    if (!response.ok) {
      throw new SoraError(payload?.message ?? `The API answered ${response.status} ${response.statusText}`, {
        status: response.status,
        code: payload?.code ?? "HTTP_ERROR",
        retryAfterSeconds: null
      });
    }

    return {
      token: payload?.token ?? "",
      account: {
        id: payload?.user?.id ?? "",
        name: payload?.user?.name ?? "",
        email: payload?.user?.email ?? ""
      }
    };
  }

  /**
   * Browses titles, one card per title. A page can hold fewer cards than
   * `per_page` when several AniList entries belong to one title.
   */
  async browse<const TOptions extends RequestOptions<BrowseParams> = {}>(
    options?: TOptions
  ): Promise<Returned<TOptions, SeriesCard[], PageMeta>> {
    const body: Envelope<SeriesCard[], PageMeta> = await read(
      this.#api.series.$get(
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
      this.#api.series[":series_id"].$get(
        {
          param: {
            series_id: seriesId
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
   * Lists every backdrop, poster, and logo TMDB has for a title, in every
   * language, plus each season's posters; best first. Pass one's `url` to
   * {@link updateArtwork} to choose it.
   */
  async images<const TOptions extends RequestOptions<ImagesParams> = {}>(
    seriesId: string,
    options?: TOptions
  ): Promise<Returned<TOptions, SeriesImage[], CountMeta>> {
    const params = options?.params;
    const body: Envelope<SeriesImage[], CountMeta> = await read(
      this.#api.series[":series_id"].images.$get(
        {
          param: {
            series_id: seriesId
          },
          query: {
            type: params?.type?.join(","),
            language: params?.language?.map((code) => code ?? "none").join(","),
            sort: params?.sort
          }
        },
        init(options)
      )
    );
    return unwrap(body, options);
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
      this.#api.series[":series_id"].artwork.$patch(
        {
          param: {
            series_id: seriesId
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
      this.#api.series[":series_id"].seasons[":season_id"].$get(
        {
          param: {
            series_id: season.seriesId,
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
      this.#api.series[":series_id"].seasons[":season_id"].episodes.$get(
        {
          param: {
            series_id: season.seriesId,
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

/** Waits for a response that has no body, or throws {@link SoraError}. */
async function send(pending: Promise<ClientResponse<unknown, number, string>>): Promise<void> {
  const response = await pending;
  if (!response.ok) {
    throw await SoraError.from(response);
  }
}

/** Waits for a response and returns its successful body, or throws {@link SoraError}. */
async function read<TResponse extends ClientResponse<unknown, number, string>>(pending: Promise<TResponse>): Promise<SuccessBody<TResponse>> {
  const response = await pending;
  if (!response.ok) {
    throw await SoraError.from(response);
  }

  return (await response.json()) as SuccessBody<TResponse>;
}
