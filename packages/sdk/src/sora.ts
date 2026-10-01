import type {
	AnimeSeason,
	AppType,
	ContinueWatching,
	CountMeta,
	Dropped,
	Envelope,
	HistoryItem,
	HistoryMeta,
	PageMeta,
	PlaybackMedia,
	PlaybackMeta,
	PlaybackPreferences,
	Profile,
	ProfileAvatar,
	Progress,
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
	SeriesProgress,
	SeriesWithEpisodes,
	Show,
	UpcomingSeries,
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

/** Changes for {@link SoraClient.updatePlaybackPreferences}; only what is given changes. */
export interface PlaybackPreferencesUpdate {
	audio?: PlaybackPreferences["audio"];
	/** The subtitles of the audio given; the other audio's stay as they are. */
	subtitles?: PlaybackPreferences["subtitles"];
	auto_skip?: boolean;
}

/** Where a profile stopped in an episode, for {@link SoraClient.saveProgress}. */
export interface ProgressInput {
	/** Whole seconds from the start. */
	position_seconds: number;
	/** How long the episode runs, in whole seconds. */
	duration_seconds: number;
	/**
	 * Whether the episode is over at that point: it played to the end, or
	 * only its credits are left. The player judges, since it knows where the
	 * credits are (see `PlaybackMedia.skip_segments`).
	 */
	finished: boolean;
}

/** Paging for {@link SoraClient.history}. */
export interface HistoryParams {
	/** Where the page starts: the `after` query parameter of the previous page's `meta.next`. */
	after?: string;
	/** @defaultValue 50 */
	limit?: number;
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

	/** Deletes a profile and what Sora keeps for it. */
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
	 * How a profile likes episodes to play: the audio, subtitles, and skipping
	 * it last picked in a player.
	 */
	async playbackPreferences(
		profileId: string,
		options?: RequestOptions,
	): Promise<PlaybackPreferences> {
		const body = await read(
			this.#api.profiles[":profile_id"]["playback-preferences"].$get(
				{
					param: {
						profile_id: profileId,
					},
				},
				init(options),
			),
		);
		return body.results;
	}

	/** Remembers what a profile picked in a player, and returns its preferences as they now stand. */
	async updatePlaybackPreferences(
		profileId: string,
		changes: PlaybackPreferencesUpdate,
		options?: RequestOptions,
	): Promise<PlaybackPreferences> {
		const body = await read(
			this.#api.profiles[":profile_id"]["playback-preferences"].$patch(
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

	/**
	 * How far a profile is into an episode, to resume it from there; `null`
	 * when the profile never played it. Play a `finished` one from the start.
	 */
	async progress(
		profileId: string,
		episode: EpisodeRef,
		options?: RequestOptions,
	): Promise<Progress | null> {
		const body = await read(
			this.#api.profiles[":profile_id"].seasons[":season_id"].episodes[":episode"].progress.$get(
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
		return body.results;
	}

	/**
	 * Remembers where a profile stopped in an episode, and returns its
	 * progress as it now stands. Call it every few seconds while the episode
	 * plays, and when it is paused, left, or ends.
	 */
	async saveProgress(
		profileId: string,
		episode: EpisodeRef,
		progress: ProgressInput,
		options?: RequestOptions,
	): Promise<Progress> {
		const body = await read(
			this.#api.profiles[":profile_id"].seasons[":season_id"].episodes[":episode"].progress.$put(
				{
					param: {
						profile_id: profileId,
						season_id: episode.seasonId,
						episode: episode.number.toString(),
					},
					json: progress,
				},
				init(options),
			),
		);
		return body.results;
	}

	/**
	 * How far a profile is through a show: its progress in every episode it
	 * played, to mark them in an episode list, and the episode to play next.
	 */
	async seriesProgress(
		profileId: string,
		seriesId: string,
		options?: RequestOptions,
	): Promise<SeriesProgress> {
		const body = await read(
			this.#api.profiles[":profile_id"].series[":series_id"].progress.$get(
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

	/**
	 * Takes a show's card out of {@link continueWatching}. Its progress and
	 * history stay, and so does the show in the profile's Shows; playing or
	 * marking an episode of it brings the card back.
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
	 * Marks an episode as watched without playing it, and saves its series to
	 * the profile's Shows. It enters {@link history} at the time of marking.
	 */
	async markEpisode(
		profileId: string,
		episode: EpisodeRef,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].seasons[":season_id"].episodes[":episode"].watched.$put(
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

	/**
	 * Makes an episode unwatched: takes it out of the profile's
	 * {@link history}, and forgets where the profile stopped in it.
	 */
	async unmarkEpisode(
		profileId: string,
		episode: EpisodeRef,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].seasons[":season_id"].episodes[":episode"].watched.$delete(
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

	/**
	 * Marks every episode of a season that can be played as watched, without
	 * playing them, and saves the series to the profile's Shows. They enter
	 * {@link history} at the time of marking.
	 */
	async markSeason(profileId: string, seasonId: string, options?: RequestOptions): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].seasons[":season_id"].watched.$put(
				{
					param: {
						profile_id: profileId,
						season_id: seasonId,
					},
				},
				init(options),
			),
		);
	}

	/**
	 * Makes a season unwatched: forgets which of its episodes the profile
	 * watched, finished or marked, and where it stopped in them.
	 */
	async unmarkSeason(profileId: string, seasonId: string, options?: RequestOptions): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].seasons[":season_id"].watched.$delete(
				{
					param: {
						profile_id: profileId,
						season_id: seasonId,
					},
				},
				init(options),
			),
		);
	}

	/**
	 * The series a profile dropped, and the stored series related to them,
	 * to leave both out of what is suggested to the profile.
	 */
	async dropped(profileId: string, options?: RequestOptions): Promise<Dropped> {
		const body = await read(
			this.#api.profiles[":profile_id"].dropped.$get(
				{
					param: {
						profile_id: profileId,
					},
				},
				init(options),
			),
		);
		return body.results;
	}

	/**
	 * Drops a whole series for a profile, and saves it to its Shows. Its
	 * progress and history stay; it leaves {@link continueWatching}, and it
	 * and the series related to it are no longer featured. Only
	 * {@link undropShow} ends a drop.
	 */
	async dropShow(profileId: string, seriesId: string, options?: RequestOptions): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].dropped[":series_id"].$put(
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

	/** Ends a profile's drop of a series. */
	async undropShow(profileId: string, seriesId: string, options?: RequestOptions): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].dropped[":series_id"].$delete(
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
	 * The shows a profile is in the middle of, the most recently played
	 * first, each with the episode to play next: the one it stopped in, or
	 * the one after the last it finished. A show is left out while its next
	 * season is still airing or came out after the profile finished the one
	 * before it, or its next part is a film, an OVA, or a special, until the
	 * profile starts that itself.
	 */
	async continueWatching<const TOptions extends RequestOptions = {}>(
		profileId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, ContinueWatching[], CountMeta>> {
		const body: Envelope<ContinueWatching[], CountMeta> = await read(
			this.#api.profiles[":profile_id"]["continue-watching"].$get(
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
	 * A profile's Shows, the most recently active first: the series it saved
	 * to watch later, and the ones it started watching. Each has a `status`
	 * (`planned`, `watching`, `completed`, or `dropped`) that tells where the
	 * profile is with it; show it as it is, rather than working it out again
	 * from `next` and `offered`.
	 */
	async shows<const TOptions extends RequestOptions = {}>(
		profileId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, Show[], CountMeta>> {
		const body: Envelope<Show[], CountMeta> = await read(
			this.#api.profiles[":profile_id"].shows.$get(
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
	 * Saves a series to a profile's Shows; one already there stays as it is.
	 * Playing an episode of a series saves it too.
	 */
	async addShow(profileId: string, seriesId: string, options?: RequestOptions): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].shows[":series_id"].$put(
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
	 * Takes a series out of a profile's Shows and out of
	 * {@link continueWatching}. Its progress and history stay, so playing an
	 * episode of it brings it back where the profile left off.
	 */
	async removeShow(profileId: string, seriesId: string, options?: RequestOptions): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].shows[":series_id"].$delete(
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
	 * The episodes a profile played or marked watched, the most recent
	 * first, a page at a time. Each is listed once: at when it was first
	 * finished or marked, or, while only part of it was played, at when it
	 * was last played.
	 */
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

	/**
	 * Titles with a season, film, or OVA starting within 30 days, on a day
	 * that is known: `returning` ones, with something out already, then new
	 * titles, a dozen of each kind at most, the most anticipated first.
	 */
	async upcoming<const TOptions extends RequestOptions = {}>(
		options?: TOptions,
	): Promise<Returned<TOptions, UpcomingSeries[], CountMeta>> {
		const body: Envelope<UpcomingSeries[], CountMeta> = await read(
			this.#api.upcoming.$get(undefined, init(options)),
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
