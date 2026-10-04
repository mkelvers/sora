import type {
	AnimeSeason,
	AppType,
	ContinueWatching,
	CountMeta,
	Envelope,
	Episode,
	EpisodesMeta,
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
	Series,
	SeriesCard,
	SeriesImage,
	SeriesMeta,
	SeriesProgress,
	SeriesWithEpisodes,
	UpcomingSeries,
	WatchlistEntry,
	WatchlistStatus,
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
	 * Whether the title carries its episodes, so its page needs one request.
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

/** An episode, by its title and its number in it. */
export interface EpisodeRef {
	seriesId: string;
	/** The episode's number in the series, from 1, as {@link Episode.number}. */
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
 * it carries its episodes.
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
 * const media = await sora.playback({ seriesId: series.id, number: series.episodes[0].number });
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
	async signIn(credentials: SignIn, options?: RequestOptions): Promise<Session> {
		const response = await this.#auth("sign-in/email", credentials, options);
		const signedIn = (await response.json()) as {
			token: string;
			user: Session["account"];
		};

		return {
			token: signedIn.token,
			account: {
				id: signedIn.user.id,
				name: signedIn.user.name,
				email: signedIn.user.email,
			},
		};
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
	 * How far a profile is into an episode, to resume it from there: in the
	 * rewatch it is in the middle of, if any, else in its first viewing;
	 * `null` when it did not play it there. Play a `finished` one from the
	 * start.
	 */
	async progress(
		profileId: string,
		episode: EpisodeRef,
		options?: RequestOptions,
	): Promise<Progress | null> {
		const body = await read(
			this.#api.profiles[":profile_id"].series[":series_id"].episodes[":episode"].progress.$get(
				{
					param: {
						profile_id: profileId,
						series_id: episode.seriesId,
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
	 * progress as it now stands: `null` when the episode was never played
	 * past its start, since stopping at second 0 is not remembered. A
	 * finished episode stays as it was unless it is finished again. Call it
	 * every few seconds while the episode plays, and when it is paused, left,
	 * or ends.
	 */
	async saveProgress(
		profileId: string,
		episode: EpisodeRef,
		progress: ProgressInput,
		options?: RequestOptions,
	): Promise<Progress | null> {
		const body = await read(
			this.#api.profiles[":profile_id"].series[":series_id"].episodes[":episode"].progress.$put(
				{
					param: {
						profile_id: profileId,
						series_id: episode.seriesId,
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
	 * How far a profile is through a title: its progress in every episode it
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
	 * Forgets a profile's progress in every episode of a title, in its first
	 * viewing and any rewatch, which takes it out of {@link continueWatching}.
	 */
	async removeProgress(
		profileId: string,
		seriesId: string,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].series[":series_id"].progress.$delete(
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
	 * Marks every episode a title lists watched without playing them, as if
	 * each had been played to its end just now. During a rewatch it ends the
	 * rewatch instead: its progress is forgotten, and only episodes the first
	 * viewing left unfinished are marked. {@link removeProgress} marks the
	 * title unwatched.
	 */
	async markSeriesWatched(
		profileId: string,
		seriesId: string,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].series[":series_id"].watched.$put(
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
	 * Marks an episode watched without playing it, as if it had been played
	 * to its end just now, in the rewatch the profile is in the middle of, if
	 * any.
	 */
	async markEpisodeWatched(
		profileId: string,
		episode: EpisodeRef,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].series[":series_id"].episodes[":episode"].watched.$put(
				{
					param: {
						profile_id: profileId,
						series_id: episode.seriesId,
						episode: episode.number.toString(),
					},
				},
				init(options),
			),
		);
	}

	/**
	 * Forgets a profile's progress in an episode, so it is neither watched
	 * nor started: in the rewatch it is in the middle of, if any, else in its
	 * first viewing.
	 */
	async markEpisodeUnwatched(
		profileId: string,
		episode: EpisodeRef,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].series[":series_id"].episodes[":episode"].watched.$delete(
				{
					param: {
						profile_id: profileId,
						series_id: episode.seriesId,
						episode: episode.number.toString(),
					},
				},
				init(options),
			),
		);
	}

	/**
	 * Starts watching a title again from its first episode. Until the profile
	 * finishes its last episode again, or marks the title watched, what it
	 * plays is remembered apart from its first viewing, which stays as it
	 * was, and {@link seriesProgress} follows it (see
	 * {@link SeriesProgress.rewatch_started_at}).
	 */
	async startRewatch(profileId: string, seriesId: string, options?: RequestOptions): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].series[":series_id"].rewatch.$post(
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
	 * The titles a profile is in the middle of, the most recently played
	 * first, each with the episode to play next: the one it stopped in, or
	 * the one after the last it finished.
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
	 * Takes a title's card out of {@link continueWatching}. Its progress
	 * stays, and so does its place on the watchlist; playing an episode of it
	 * brings the card back.
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

	/** Every title on a profile's watchlist with its status, the one whose status changed last first. */
	async watchlist<const TOptions extends RequestOptions = {}>(
		profileId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, WatchlistEntry[], CountMeta>> {
		const body: Envelope<WatchlistEntry[], CountMeta> = await read(
			this.#api.profiles[":profile_id"].watchlist.$get(
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
	 * Puts a title on a profile's watchlist with a status, or changes the
	 * status of one already there.
	 */
	async setWatchlistStatus(
		profileId: string,
		seriesId: string,
		status: WatchlistStatus,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].watchlist[":series_id"].$put(
				{
					param: {
						profile_id: profileId,
						series_id: seriesId,
					},
					json: {
						status,
					},
				},
				init(options),
			),
		);
	}

	/** Takes a title off a profile's watchlist. Its progress in it stays. */
	async removeFromWatchlist(
		profileId: string,
		seriesId: string,
		options?: RequestOptions,
	): Promise<void> {
		await send(
			this.#api.profiles[":profile_id"].watchlist[":series_id"].$delete(
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
	 * Calls one of Better Auth's endpoints under `/v1/auth`, which answer outside the `{ meta, results }` envelope.
	 *
	 * @throws {@link SoraError} when the endpoint answers with an error.
	 */
	async #auth(path: string, body: object, options: RequestOptions | undefined): Promise<Response> {
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

		if (!response.ok) {
			throw await SoraError.from(response);
		}

		return response;
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
	 * Loads a title's page: details, artwork, the next episode, and the other
	 * titles of its franchise; with `params.episodes`, its episodes too. A
	 * title is one AniList entry: a show's seasons, films, and OVAs are each a
	 * title, found from one another under `related`.
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

	/**
	 * Lists a title's episodes, numbered from 1. {@link series} with
	 * `params.episodes` returns them with the title.
	 */
	async episodes<const TOptions extends RequestOptions = {}>(
		seriesId: string,
		options?: TOptions,
	): Promise<Returned<TOptions, Episode[], EpisodesMeta>> {
		const body: Envelope<Episode[], EpisodesMeta> = await read(
			this.#api.series[":series_id"].episodes.$get(
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
			this.#api.series[":series_id"].episodes[":episode"].playback.$get(
				{
					param: {
						series_id: episode.seriesId,
						episode: episode.number.toString(),
					},
				},
				init(options),
			),
		);
		return unwrap(body, options);
	}

	/**
	 * Titles starting within 30 days, on a day that is known: `returning`
	 * ones, whose franchise has something out already, then new titles, a
	 * dozen of each kind at most, the most anticipated first. A returning one
	 * is listed as the earliest title of its franchise that is out.
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
