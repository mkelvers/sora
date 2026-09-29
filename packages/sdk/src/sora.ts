import type {
	AnimeSeason,
	AppType,
	ContinueWatchingItem,
	CountMeta,
	Envelope,
	HistoryItem,
	HistoryMeta,
	LibraryEntry,
	LibraryItem,
	LibraryMeta,
	LibraryStatus,
	Notification,
	NotificationsMeta,
	PageMeta,
	PlaybackMedia,
	PlaybackMeta,
	Profile,
	ProfileAvatar,
	Release,
	ScheduledEpisode,
	ScheduleMeta,
	SeasonsMeta,
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
	TitleProgressMeta,
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
	/** Only titles that can be watched with this audio; a page can then hold fewer cards than `per_page`. */
	audio?: BrowseQuery["audio"];
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

/** Filters and paging for {@link SoraClient.releases}, applied to the AniList entry each latest episode belongs to. */
export interface ReleasesParams {
	format?: BrowseQuery["format"];
	audio?: BrowseQuery["audio"];
	page?: number;
	per_page?: number;
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

/** A profile's name, tile color, and avatar, for {@link SoraClient.createProfile} and {@link SoraClient.updateProfile}. */
export interface ProfileInput {
	name: string;
	/** A hex color such as `#4f7cff`; picked from a palette when omitted. */
	color?: string;
	/** A sprout seeded with the profile's ID when omitted. */
	avatar?: ProfileAvatar;
}

/** Filters for {@link SoraClient.continueWatching}. */
export interface ContinueWatchingParams {
	/** Only these titles, such as a title's page or a page of search results: at most one entry each. */
	series_id?: string[];
}

/** Paging for {@link SoraClient.notifications}. */
export interface NotificationsParams {
	/** At most this many notifications; 30 when omitted. */
	limit?: number;
}

/** Filters for {@link SoraClient.library}. */
export interface LibraryParams {
	/** Only titles with this status. */
	status?: LibraryStatus;
}

/** Paging for {@link SoraClient.history}. */
export interface HistoryParams {
	/** Where the page starts: the `after` query parameter of the previous page's `meta.next`. */
	after?: string;
	/** @defaultValue 50 */
	limit?: number;
}

/** What {@link SoraClient.markWatched} marks. */
export interface MarkWatched {
	/** Only this season; every season in watch order when omitted. */
	season_id?: string;
	/** Only this episode of `season_id`. */
	episode?: number;
	watched: boolean;
}

/** A playback position for {@link SoraClient.recordProgress}. */
export interface ProgressUpdate {
	season_id: string;
	/** Position within the season, from 1. */
	episode: number;
	position_seconds: number;
	duration_seconds: number;
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
 * HTTPS URL replaces the image, `false` shows none, `null` goes back to the
 * one Sora chose, and an omitted field stays as it is.
 */
export interface ArtworkChanges {
	poster_url?: string | false | null;
	backdrop_url?: string | false | null;
	logo_url?: string | false | null;
	/** How large to draw the logo, relative to its usual size: 1 is as usual, from 0.5 to 2. */
	logo_scale?: number;
	/** How far right to move the logo on the series page, in widths of its hero, from -1 to 1. */
	logo_offset_x?: number;
	/** How far down to move the logo on the series page, in widths of its hero, from -1 to 1. */
	logo_offset_y?: number;
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
			baseUrl: options.baseUrl.replace(/\/+$/, ""),
		};
		this.#api = hc<AppType>(this.#options.baseUrl, {
			fetch: options.fetch,
			headers: options.headers,
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
	async profiles<const TOptions extends RequestOptions = {}>(
		options?: TOptions,
	): Promise<Returned<TOptions, Profile[], CountMeta>> {
		const body: Envelope<Profile[], CountMeta> = await read(
			this.#api.profiles.$get(undefined, init(options)),
		);
		return unwrap(body, options);
	}

	/** Adds a profile to the signed-in account; there is no limit. */
	async createProfile(input: ProfileInput, options?: RequestOptions): Promise<Profile> {
		const body = await read(
			this.#api.profiles.$post(
				{
					json: input,
				},
				init(options),
			),
		);
		return body.results;
	}

	/** Renames or recolors one of the signed-in account's profiles. */
	async updateProfile(
		profileId: string,
		changes: Partial<ProfileInput>,
		options?: RequestOptions,
	): Promise<Profile> {
		const body = await read(
			this.#api.profiles[":profile_id"].$patch(
				{
					param: {
						profile_id: profileId,
					},
					json: changes,
				},
				init(options),
			),
		);
		return body.results;
	}

	/** Deletes a profile with its library, progress, and history. */
	async deleteProfile(profileId: string, options?: RequestOptions): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].$delete(
				{
					param: {
						profile_id: profileId,
					},
				},
				init(options),
			),
		);
	}

	/**
	 * The titles a profile is part-way through, most recent first, each with the
	 * episode and position to resume.
	 */
	async continueWatching<const TOptions extends RequestOptions<ContinueWatchingParams> = {}>(
		profileId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, ContinueWatchingItem[], CountMeta>> {
		const body: Envelope<ContinueWatchingItem[], CountMeta> = await read(
			this.#api.profiles[":profile_id"]["continue-watching"].$get(
				{
					param: {
						profile_id: profileId,
					},
					query: {
						series_id: options?.params?.series_id?.join(","),
					},
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/**
	 * Titles a profile has not seen that it may like, best fit first, from
	 * what it has played and listed. Empty for a profile with no history.
	 */
	async recommendations<const TOptions extends RequestOptions = {}>(
		profileId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, SeriesCard[], CountMeta>> {
		const body: Envelope<SeriesCard[], CountMeta> = await read(
			this.#api.profiles[":profile_id"].recommendations.$get(
				{
					param: {
						profile_id: profileId,
					},
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/**
	 * Titles to feature on a profile's home page, mostly new and well liked,
	 * then the best rated and popular hits. They change every Monday.
	 */
	async featured<const TOptions extends RequestOptions = {}>(
		profileId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, SeriesCard[], CountMeta>> {
		const body: Envelope<SeriesCard[], CountMeta> = await read(
			this.#api.profiles[":profile_id"].featured.$get(
				{
					param: {
						profile_id: profileId,
					},
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/**
	 * A profile's progress through a title: the state of every episode it
	 * played or marked watched, and what is derived from them, such as each
	 * season's progress, whether it is caught up, and where to continue.
	 */
	async progress<const TOptions extends RequestOptions = {}>(
		profileId: string,
		seriesId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, TitleProgress, TitleProgressMeta>> {
		const body: Envelope<TitleProgress, TitleProgressMeta> = await read(
			this.#api.profiles[":profile_id"].progress[":series_id"].$get(
				{
					param: {
						profile_id: profileId,
						series_id: seriesId,
					},
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/**
	 * Saves a playback position. Report it every few seconds while playing, and
	 * on pause and exit; an older position than the saved one changes nothing.
	 * Only playback goes into the history; to mark episodes watched without
	 * playing them, use {@link SoraClient.markWatched}.
	 */
	async recordProgress(
		profileId: string,
		update: ProgressUpdate,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].progress.$put(
				{
					param: {
						profile_id: profileId,
					},
					json: {
						...update,
						event_at: (update.event_at ?? new Date()).toISOString(),
					},
				},
				init(options),
			),
		);
	}

	/**
	 * Removes a title from a profile's continue watching until it plays the
	 * title again. Nothing else about the title changes.
	 */
	async dismissContinueWatching(
		profileId: string,
		seriesId: string,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"]["continue-watching"][":series_id"].$delete(
				{
					param: {
						profile_id: profileId,
						series_id: seriesId,
					},
				},
				init(options),
			),
		);
	}

	/**
	 * Marks an episode, a season's released episodes, or a whole title's,
	 * watched or unwatched. It leaves the history alone; the title's library
	 * status follows, as it does for playback.
	 */
	async markWatched(
		profileId: string,
		seriesId: string,
		marked: MarkWatched,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].progress[":series_id"].watched.$put(
				{
					param: {
						profile_id: profileId,
						series_id: seriesId,
					},
					json: marked,
				},
				init(options),
			),
		);
	}

	/** Forgets a profile's episode progress through a title, to start it over; its history stays. */
	async clearProgress(
		profileId: string,
		seriesId: string,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].progress[":series_id"].$delete(
				{
					param: {
						profile_id: profileId,
						series_id: seriesId,
					},
				},
				init(options),
			),
		);
	}

	/**
	 * A profile's library, most recently active first, with the status of
	 * each title and its progress. `meta.counts` has how many titles have
	 * each status.
	 */
	async library<const TOptions extends RequestOptions<LibraryParams> = {}>(
		profileId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, LibraryItem[], LibraryMeta>> {
		const body: Envelope<LibraryItem[], LibraryMeta> = await read(
			this.#api.profiles[":profile_id"].library.$get(
				{
					param: {
						profile_id: profileId,
					},
					query: {
						status: options?.params?.status,
					},
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/** A title's library status for a profile, `null` when it is not in the library. */
	async libraryEntry(
		profileId: string,
		seriesId: string,
		options?: RequestOptions,
	): Promise<LibraryEntry> {
		const body = await read(
			this.#api.profiles[":profile_id"].library[":series_id"].$get(
				{
					param: {
						profile_id: profileId,
						series_id: seriesId,
					},
				},
				init(options),
			),
		);
		return body.results;
	}

	/** Puts a title in a profile's library as `planning`; a title already there keeps its status. */
	async addToLibrary(profileId: string, seriesId: string, options?: RequestOptions): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].library[":series_id"].$put(
				{
					param: {
						profile_id: profileId,
						series_id: seriesId,
					},
				},
				init(options),
			),
		);
	}

	/** Takes a title out of a profile's library; its progress and history stay. */
	async removeFromLibrary(
		profileId: string,
		seriesId: string,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].library[":series_id"].$delete(
				{
					param: {
						profile_id: profileId,
						series_id: seriesId,
					},
				},
				init(options),
			),
		);
	}

	/** The episodes a profile played, most recent first, a page at a time. */
	async history<const TOptions extends RequestOptions<HistoryParams> = {}>(
		profileId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, HistoryItem[], HistoryMeta>> {
		const body: Envelope<HistoryItem[], HistoryMeta> = await read(
			this.#api.profiles[":profile_id"].history.$get(
				{
					param: {
						profile_id: profileId,
					},
					query: {
						after: options?.params?.after,
						limit: options?.params?.limit?.toString(),
					},
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/**
	 * What came out for the titles in a profile's library, newest first: new
	 * seasons, films, and OVAs, and new episodes of seasons that were out.
	 * `meta.unread` counts those not marked read.
	 */
	async notifications<const TOptions extends RequestOptions<NotificationsParams> = {}>(
		profileId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, Notification[], NotificationsMeta>> {
		const body: Envelope<Notification[], NotificationsMeta> = await read(
			this.#api.profiles[":profile_id"].notifications.$get(
				{
					param: {
						profile_id: profileId,
					},
					query: {
						limit: options?.params?.limit?.toString(),
					},
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/**
	 * Marks all of a profile's notifications read up to `seenAt`: pass the
	 * `released_at` of the newest one, so one that came out meanwhile
	 * stays unread.
	 */
	async markNotificationsSeen(
		profileId: string,
		seenAt: string,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].notifications.seen.$put(
				{
					param: {
						profile_id: profileId,
					},
					json: {
						seen_at: seenAt,
					},
				},
				init(options),
			),
		);
	}

	/** Marks one of a profile's notifications read. */
	async markNotificationRead(
		profileId: string,
		notificationId: string,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].notifications[":notification_id"].read.$put(
				{
					param: {
						profile_id: profileId,
						notification_id: notificationId,
					},
				},
				init(options),
			),
		);
	}

	/** Deletes one of a profile's notifications for good. */
	async dismissNotification(
		profileId: string,
		notificationId: string,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].notifications[":notification_id"].$delete(
				{
					param: {
						profile_id: profileId,
						notification_id: notificationId,
					},
				},
				init(options),
			),
		);
	}

	/** Removes an episode from a profile's history; whether it is watched stays as it is. */
	async forgetEpisode(
		profileId: string,
		episode: EpisodeRef,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].history[":season_id"][":episode"].$delete(
				{
					param: {
						profile_id: profileId,
						season_id: episode.seasonId,
						episode: episode.number.toString(),
					},
				},
				init(options),
			),
		);
	}

	/** Calls one of Better Auth's endpoints under `/v1/auth`, which answer outside the `{ meta, results }` envelope. */
	async #auth(path: string, body: object, options: RequestOptions | undefined): Promise<Session> {
		const response = await (this.#options.fetch ?? fetch)(
			`${this.#options.baseUrl}/v1/auth/${path}`,
			{
				method: "POST",
				headers: {
					// Better Auth checks the origin of requests that look like a browser's,
					// as Node's fetch does; this client speaks for the API's own origin.
					// Browsers ignore it and send their own.
					Origin: new URL(this.#options.baseUrl).origin,
					...this.#options.headers,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
				signal: options?.signal,
			},
		);

		const payload = (await response.json().catch(() => null)) as {
			token?: string;
			user?: Session["account"];
			message?: string;
			code?: string;
		} | null;

		if (!response.ok) {
			throw new SoraError(
				payload?.message ?? `The API answered ${response.status} ${response.statusText}`,
				{
					status: response.status,
					code: payload?.code ?? "HTTP_ERROR",
					retryAfterSeconds: null,
				},
			);
		}

		return {
			token: payload?.token ?? "",
			account: {
				id: payload?.user?.id ?? "",
				name: payload?.user?.name ?? "",
				email: payload?.user?.email ?? "",
			},
		};
	}

	/**
	 * Browses titles, one card per title. A page can hold fewer cards than
	 * `per_page` when several AniList entries belong to one title.
	 */
	async browse<const TOptions extends RequestOptions<BrowseParams> = {}>(
		options?: TOptions,
	): Promise<Returned<TOptions, SeriesCard[], PageMeta>> {
		const body: Envelope<SeriesCard[], PageMeta> = await read(
			this.#api.series.$get(
				{
					query: browseQuery(options?.params),
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/**
	 * Searches titles for `query`, best match first unless `params.sort` is
	 * given. One card per title, as {@link browse} returns them.
	 */
	async search<const TOptions extends RequestOptions<BrowseParams> = {}>(
		query: string,
		options?: TOptions,
	): Promise<Returned<TOptions, SeriesCard[], PageMeta>> {
		const body: Envelope<SeriesCard[], PageMeta> = await read(
			this.#api.search.$get(
				{
					query: {
						q: query,
						...browseQuery(options?.params),
					},
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/**
	 * Loads a title's page: details, artwork, seasons, the next episode, and
	 * related titles; with `params.episodes`, every season's episodes too.
	 */
	async series<const TOptions extends RequestOptions<SeriesParams> = {}>(
		seriesId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, SeriesOf<TOptions>, SeriesMeta>> {
		const body: Envelope<Series | SeriesWithEpisodes, SeriesMeta> = await read(
			this.#api.series[":series_id"].$get(
				{
					param: {
						series_id: seriesId,
					},
					query: {
						episodes: options?.params?.episodes ? "true" : undefined,
					},
				},
				init(options),
			),
		);
		return unwrap(body as Envelope<SeriesOf<TOptions>, SeriesMeta>, options);
	}

	/**
	 * Lists every backdrop, poster, and logo TMDB has for a title, in every
	 * language, plus each season's posters; best first. Pass one's `url` to
	 * {@link updateArtwork} to choose it. They are fetched from TMDB once and
	 * kept; {@link refreshImages} fetches them again.
	 */
	async images<const TOptions extends RequestOptions<ImagesParams> = {}>(
		seriesId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, SeriesImage[], CountMeta>> {
		const params = options?.params;
		const body: Envelope<SeriesImage[], CountMeta> = await read(
			this.#api.series[":series_id"].images.$get(
				{
					param: {
						series_id: seriesId,
					},
					query: {
						type: params?.type?.join(","),
						language: params?.language?.map((code) => code ?? "none").join(","),
						sort: params?.sort,
					},
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/**
	 * Fetches a title's images from TMDB again, past every cache, so artwork
	 * added there since can be chosen. Resolves to all of them, best first.
	 */
	async refreshImages<const TOptions extends RequestOptions = {}>(
		seriesId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, SeriesImage[], CountMeta>> {
		const body: Envelope<SeriesImage[], CountMeta> = await read(
			this.#api.series[":series_id"].images.refresh.$post(
				{
					param: {
						series_id: seriesId,
					},
				},
				init(options),
			),
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
		options?: TOptions,
	): Promise<Returned<TOptions, Series, SeriesMeta>> {
		const body: Envelope<Series, SeriesMeta> = await read(
			this.#api.series[":series_id"].artwork.$patch(
				{
					param: {
						series_id: seriesId,
					},
					json: changes,
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/** Loads one season of a title. */
	async season<const TOptions extends RequestOptions = {}>(
		season: SeasonRef,
		options?: TOptions,
	): Promise<Returned<TOptions, Season, SeasonMeta>> {
		const body: Envelope<Season, SeasonMeta> = await read(
			this.#api.series[":series_id"].seasons[":season_id"].$get(
				{
					param: {
						series_id: season.seriesId,
						season_id: season.seasonId,
					},
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/**
	 * Lists a season's episodes, numbered from 1. {@link series} with
	 * `params.episodes` returns every season's at once.
	 */
	async episodes<const TOptions extends RequestOptions = {}>(
		season: SeasonRef,
		options?: TOptions,
	): Promise<Returned<TOptions, SeasonEpisode[], SeasonEpisodesMeta>> {
		const body: Envelope<SeasonEpisode[], SeasonEpisodesMeta> = await read(
			this.#api.series[":series_id"].seasons[":season_id"].episodes.$get(
				{
					param: {
						series_id: season.seriesId,
						season_id: season.seasonId,
					},
				},
				init(options),
			),
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
		options?: TOptions,
	): Promise<Returned<TOptions, PlaybackMedia[], PlaybackMeta>> {
		const body: Envelope<PlaybackMedia[], PlaybackMeta> = await read(
			this.#api.seasons[":season_id"].episodes[":episode"].playback.$get(
				{
					param: {
						season_id: episode.seasonId,
						episode: episode.number.toString(),
					},
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/** Genre names accepted by `params.genres` of {@link browse} and {@link search}. */
	async genres<const TOptions extends RequestOptions = {}>(
		options?: TOptions,
	): Promise<Returned<TOptions, string[], CountMeta>> {
		const body: Envelope<string[], CountMeta> = await read(
			this.#api.genres.$get(undefined, init(options)),
		);
		return unwrap(body, options);
	}

	/**
	 * The titles with an episode out in the last 30 days, each with its latest
	 * episode that can be watched, the latest first. A new episode of a show
	 * counts, not only a new title.
	 */
	async releases<const TOptions extends RequestOptions<ReleasesParams> = {}>(
		options?: TOptions,
	): Promise<Returned<TOptions, Release[], PageMeta>> {
		const body: Envelope<Release[], PageMeta> = await read(
			this.#api.releases.$get(
				{
					query: {
						format: options?.params?.format?.join(","),
						audio: options?.params?.audio,
						page: options?.params?.page?.toString(),
						per_page: options?.params?.per_page?.toString(),
					},
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/**
	 * Every season some anime started in, the latest first, up to next
	 * season. `meta.current` is the season airing now.
	 */
	async seasons<const TOptions extends RequestOptions = {}>(
		options?: TOptions,
	): Promise<Returned<TOptions, AnimeSeason[], SeasonsMeta>> {
		const body: Envelope<AnimeSeason[], SeasonsMeta> = await read(
			this.#api.seasons.$get(undefined, init(options)),
		);
		return unwrap(body, options);
	}

	/** Episodes airing in a window of up to 14 days, in broadcast order. Defaults to the next 7 days. */
	async schedule<const TOptions extends RequestOptions<ScheduleParams> = {}>(
		options?: TOptions,
	): Promise<Returned<TOptions, ScheduledEpisode[], ScheduleMeta>> {
		const body: Envelope<ScheduledEpisode[], ScheduleMeta> = await read(
			this.#api.schedule.$get(
				{
					query: {
						from: options?.params?.from?.toISOString(),
						until: options?.params?.until?.toISOString(),
					},
				},
				init(options),
			),
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
		audio: params.audio,
		page: params.page?.toString(),
		per_page: params.per_page?.toString(),
	};
}

/** Passes a method's {@link RequestOptions} to the underlying request. */
function init(options: RequestOptions<unknown> | undefined) {
	return {
		init: {
			signal: options?.signal,
		},
	};
}

/** A body's results, or the whole body when the caller asked for its meta. */
function unwrap<TOptions extends RequestOptions<unknown>, TResults, TMeta>(
	body: Envelope<TResults, TMeta>,
	options: TOptions | undefined,
): Returned<TOptions, TResults, TMeta> {
	return (options?.meta ? body : body.results) as Returned<TOptions, TResults, TMeta>;
}

/** The body of a route's successful (2xx) response. */
type SuccessBody<TResponse> =
	TResponse extends ClientResponse<infer TBody, infer TStatus, "json">
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
async function read<TResponse extends ClientResponse<unknown, number, string>>(
	pending: Promise<TResponse>,
): Promise<SuccessBody<TResponse>> {
	const response = await pending;
	if (!response.ok) {
		throw await SoraError.from(response);
	}

	return (await response.json()) as SuccessBody<TResponse>;
}
