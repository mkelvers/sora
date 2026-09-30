/**
 * The contract of every `/v1` route: path, parameters, and documented
 * responses. The server validates requests against these and the OpenAPI
 * document is generated from them, so the two cannot disagree. Handlers live
 * in `v1.ts`.
 *
 * `operationId`s name the methods of clients generated for other languages
 * (Kotlin, Swift). They are part of the public contract: never rename one
 * within `/v1`.
 */
import { createRoute, z } from "@hono/zod-openapi";
import { BrowseQuerySchema } from "@sora/core/catalog";
import { logoPlacement } from "@sora/core/series";

import { CountMetaSchema, envelopeOf, PageMetaSchema } from "./envelope";
import {
	ContinueWatchingItemSchema,
	HistoryItemSchema,
	HistoryMetaSchema,
	LibraryEntrySchema,
	LibraryItemSchema,
	LibraryMetaSchema,
	LibraryStatusSchema,
	MarkWatchedSchema,
	NotificationSchema,
	NotificationsMetaSchema,
	NotificationsSeenSchema,
	EpisodeNumberParam,
	ImageTypeSchema,
	json,
	PlaybackMediaSchema,
	PlaybackMetaSchema,
	PlaybackPreferencesSchema,
	PlaybackPreferencesUpdateSchema,
	problem,
	ProfileIdParam,
	ProfileInputSchema,
	ProfileSchema,
	ProgressUpdateSchema,
	AnimeSeasonSchema,
	ReleaseSchema,
	ScheduledEpisodeSchema,
	SeasonSchema,
	SeasonEpisodeSchema,
	SeasonIdParam,
	SeriesCardSchema,
	SeriesIdParam,
	SeriesImageSchema,
	SeriesSchema,
	TitleProgressSchema,
} from "./schemas";

const { shape: browse } = BrowseQuerySchema;

/** A comma-separated query value, such as `genres=Action,Comedy`, as a list. */
function commaSeparated<TList extends z.ZodType<unknown, string[]>>(list: TList, example: string) {
	return z
		.string()
		.transform((value) =>
			value
				.split(",")
				.map((part) => part.trim())
				.filter((part) => part.length > 0),
		)
		.pipe(list)
		.optional()
		.openapi({
			type: "string",
			example,
		});
}

/**
 * The core's browse filters as query parameters in snake_case, without the
 * free-text search, which is its own route. Query strings carry every value
 * as text, so numbers and lists are parsed before the core's own rules
 * apply; the core supplies defaults. Unknown parameters are rejected: a
 * misspelled one would otherwise return the unfiltered catalog.
 */
const BrowseParams = BrowseQuerySchema.omit({
	search: true,
	seasonYear: true,
	perPage: true,
})
	.strict()
	.extend({
		season_year: z.coerce.number().pipe(browse.seasonYear.unwrap()).optional(),
		format: commaSeparated(browse.format.unwrap(), "TV,MOVIE"),
		genres: commaSeparated(browse.genres.unwrap(), "Action,Fantasy"),
		page: z.coerce.number().pipe(browse.page.unwrap()).optional(),
		per_page: z.coerce.number().pipe(browse.perPage.unwrap()).optional(),
	});

/** {@link BrowseParams} with the search text, which is required. */
const SearchParams = BrowseParams.extend({
	q: browse.search.unwrap().openapi({
		description: "The text to search titles for.",
		example: "k-on",
	}),
});

/** A season, addressed under the series it belongs to. */
const SeasonParams = z.object({
	series_id: SeriesIdParam,
	season_id: SeasonIdParam,
});

/** A page of title cards. */
const SeriesPageSchema = envelopeOf(z.array(SeriesCardSchema), PageMetaSchema);

/** Nothing to say about the response beyond its results. */
const EmptyMetaSchema = z.object({}).openapi("EmptyMeta");

/** An episode, addressed under its season. */
const EpisodeParams = SeasonParams.extend({
	episode: EpisodeNumberParam,
});

export const browseSeries = createRoute({
	operationId: "browseSeries",
	method: "get",
	path: "/series",
	tags: ["Series"],
	summary: "Browse series",
	description:
		"Filters and sorts the catalog; `searchSeries` searches it by text. One card per title: a show appears once, not once per season. A page can hold fewer cards than `per_page` when several AniList entries belong to one title, and titles not prepared yet may be missing while they are prepared in the background.",
	request: {
		query: BrowseParams,
	},
	responses: {
		200: json(SeriesPageSchema, "A page of titles."),
		422: problem("The query is invalid."),
		503: problem("The catalog upstream is unavailable; retry after `Retry-After`."),
	},
});

export const searchSeries = createRoute({
	operationId: "searchSeries",
	method: "get",
	path: "/search",
	tags: ["Series"],
	summary: "Search series",
	description:
		"Finds titles matching `q` in English, romaji, Japanese, or a known synonym or abbreviation, forgiving typos. Best match first, weighing how popular titles are, unless `sort` is given; narrowed by the same filters as `browseSeries`. One card per title, and a first search for a title not prepared yet may come back without it while it is prepared in the background.",
	request: {
		query: SearchParams,
	},
	responses: {
		200: json(SeriesPageSchema, "A page of titles."),
		422: problem("The query is invalid or `q` is missing."),
		503: problem("The catalog upstream is unavailable; retry after `Retry-After`."),
	},
});

export const getSeries = createRoute({
	operationId: "getSeries",
	method: "get",
	path: "/series/{series_id}",
	tags: ["Series"],
	summary: "Get a series",
	description: "The title's page: details, artwork, seasons, the next episode, and related titles.",
	request: {
		params: z.object({
			series_id: SeriesIdParam,
		}),
		query: z
			.object({
				episodes: z
					.enum(["true", "false"])
					.transform((value) => value === "true")
					.optional()
					.openapi({
						type: "boolean",
						description:
							"Whether each season carries its episodes, as `listSeasonEpisodes` lists them, so a title's page needs one request.",
						example: true,
					}),
			})
			.strict(),
	},
	responses: {
		200: json(
			envelopeOf(
				SeriesSchema.extend({
					seasons: z.array(
						SeasonSchema.extend({
							episodes: z.array(SeasonEpisodeSchema).optional().openapi({
								description:
									"The season's episodes, numbered from 1; present only with `episodes=true`.",
							}),
						}),
					),
				}),
				EmptyMetaSchema,
			),
			"The title.",
		),
		404: problem("No such title."),
		422: problem("The query is invalid."),
	},
});

export const listImages = createRoute({
	operationId: "listImages",
	method: "get",
	path: "/series/{series_id}/images",
	tags: ["Series"],
	summary: "List a series' images",
	description:
		"Every backdrop, poster, and logo TMDB has for the title, in every language, and for a show each season's posters too. Choose one with `updateArtwork`. Titles TMDB does not list have none. They are fetched from TMDB the first time and kept; `refreshImages` fetches them again.",
	request: {
		params: z.object({
			series_id: SeriesIdParam,
		}),
		query: z
			.object({
				type: commaSeparated(z.array(ImageTypeSchema), "backdrop,poster").openapi({
					description: "Only these types; every type when omitted.",
				}),
				language: commaSeparated(
					z
						.array(z.string().regex(/^(?:[a-z]{2}|none)$/))
						.transform((codes) => codes.map((code) => (code === "none" ? null : code))),
					"en,none",
				).openapi({
					description:
						"Only these ISO 639-1 languages, `none` meaning textless; every language when omitted.",
				}),
				sort: z.enum(["votes", "quality"]).optional().openapi({
					description:
						"`votes`: TMDB users' rating, weighted by how many voted, then size (the default). `quality`: the largest original first, then votes.",
				}),
			})
			.strict(),
	},
	responses: {
		200: json(envelopeOf(z.array(SeriesImageSchema), CountMetaSchema), "The images, best first."),
		404: problem("No such title."),
		422: problem("The query is invalid."),
		503: problem("TMDB is unavailable; retry after `Retry-After`."),
	},
});

export const refreshImages = createRoute({
	operationId: "refreshImages",
	method: "post",
	path: "/series/{series_id}/images/refresh",
	tags: ["Series"],
	summary: "Refresh a series' images",
	description:
		"Fetches the title's images from TMDB again, past every cache, and keeps them in place of the old, so artwork added on TMDB since can be chosen. When TMDB fails, the kept images stay as they were.",
	request: {
		params: z.object({
			series_id: SeriesIdParam,
		}),
	},
	responses: {
		200: json(envelopeOf(z.array(SeriesImageSchema), CountMetaSchema), "The images, best first."),
		404: problem("No such title."),
		503: problem("TMDB is unavailable; retry after `Retry-After`."),
	},
});

/** An image to use for a title's artwork, or `null` to go back to the one Sora chose. */
const ArtworkUrl = z
	.union([
		z
			.url({
				protocol: /^https$/,
			})
			.max(2_048),
		z.literal(false),
	])
	.nullable()
	.optional();

const LogoOffset = z
	.number()
	.min(logoPlacement.offset.min)
	.max(logoPlacement.offset.max)
	.optional();

export const updateArtwork = createRoute({
	operationId: "updateArtwork",
	method: "patch",
	path: "/series/{series_id}/artwork",
	tags: ["Series"],
	summary: "Change a series' artwork",
	description:
		"Chooses the title's poster, backdrop, or logo, and where and how large the logo is drawn, for everyone. An HTTPS URL replaces the image, `false` shows none, `null` goes back to the one Sora chose, and an omitted field stays as it is. The choice is kept when the title is laid out again.",
	request: {
		params: z.object({
			series_id: SeriesIdParam,
		}),
		body: {
			required: true,
			content: {
				"application/json": {
					schema: z
						.object({
							poster_url: ArtworkUrl,
							backdrop_url: ArtworkUrl,
							logo_url: ArtworkUrl,
							logo_scale: z
								.number()
								.min(logoPlacement.scale.min)
								.max(logoPlacement.scale.max)
								.optional()
								.openapi({
									description: `How large to draw the logo, relative to its usual size: 1 is as usual, from ${logoPlacement.scale.min} to ${logoPlacement.scale.max}.`,
								}),
							logo_offset_x: LogoOffset.openapi({
								description: `How far right to move the logo from its usual place on the series page, in widths of its hero, from ${logoPlacement.offset.min} to ${logoPlacement.offset.max}.`,
							}),
							logo_offset_y: LogoOffset.openapi({
								description: `How far down to move the logo from its usual place on the series page, in widths of its hero, from ${logoPlacement.offset.min} to ${logoPlacement.offset.max}.`,
							}),
						})
						.strict()
						.openapi("ArtworkChanges", {
							example: {
								backdrop_url: "https://image.tmdb.org/t/p/original/rBOnrVlck7BIlGeWVlzYiZeg4l2.jpg",
							},
						}),
				},
			},
		},
	},
	responses: {
		200: json(envelopeOf(SeriesSchema, EmptyMetaSchema), "The title, with its new artwork."),
		404: problem("No such title."),
		422: problem("The body is invalid."),
	},
});

export const getSeason = createRoute({
	operationId: "getSeason",
	method: "get",
	path: "/series/{series_id}/seasons/{season_id}",
	tags: ["Series"],
	summary: "Get a season",
	request: {
		params: SeasonParams,
	},
	responses: {
		200: json(
			envelopeOf(
				SeasonSchema,
				z.object({
					series_id: z.string(),
				}),
			),
			"The season.",
		),
		404: problem("No such season in this title."),
	},
});

export const listSeasonEpisodes = createRoute({
	operationId: "listSeasonEpisodes",
	method: "get",
	path: "/series/{series_id}/seasons/{season_id}/episodes",
	tags: ["Series"],
	summary: "List a season's episodes",
	request: {
		params: SeasonParams,
	},
	responses: {
		200: json(
			envelopeOf(
				z.array(SeasonEpisodeSchema),
				CountMetaSchema.extend({
					series_id: z.string(),
					season_id: z.string(),
				}),
			),
			"The season's episodes, numbered from 1.",
		),
		404: problem("No such season in this title."),
	},
});

export const listGenres = createRoute({
	operationId: "listGenres",
	method: "get",
	path: "/genres",
	tags: ["Series"],
	summary: "List genres",
	responses: {
		200: json(
			envelopeOf(z.array(z.string()), CountMetaSchema),
			"Genre names accepted by `browseSeries`.",
		),
	},
});

export const getSchedule = createRoute({
	operationId: "getSchedule",
	method: "get",
	path: "/schedule",
	tags: ["Series"],
	summary: "Release schedule",
	description:
		"Episodes coming out in a window of up to 14 days, in order, as AnimeSchedule's timetable has them: each once subbed and once dubbed, as it comes out. A raw broadcast counts as subbed, timed by the official subbed stream where there is one. Last week to next week are kept current. Defaults to the next 7 days.",
	request: {
		query: z.object({
			from: z.iso
				.datetime({
					offset: true,
				})
				.optional(),
			until: z.iso
				.datetime({
					offset: true,
				})
				.optional(),
		}),
	},
	responses: {
		200: json(
			envelopeOf(
				z.array(ScheduledEpisodeSchema),
				CountMetaSchema.extend({
					from: z.string(),
					until: z.string(),
				}),
			),
			"Scheduled episodes, and the window they air in.",
		),
		422: problem("The window is invalid or longer than 14 days."),
	},
});

export const listReleases = createRoute({
	operationId: "listReleases",
	method: "get",
	path: "/releases",
	tags: ["Series"],
	summary: "Newly added episodes",
	description:
		"The titles with an episode out in the last 30 days, each with its latest episode that can be watched, the latest first. A new episode of a show counts, not only a new title; an episode that has aired but cannot be played yet is left out until it can. `format` and `audio` apply to the AniList entry the latest episode belongs to.",
	request: {
		query: z
			.object({
				format: commaSeparated(browse.format.unwrap(), "TV,MOVIE"),
				audio: browse.audio,
				page: z.coerce.number().pipe(browse.page.unwrap()).optional(),
				per_page: z.coerce.number().pipe(browse.perPage.unwrap()).optional(),
			})
			.strict(),
	},
	responses: {
		200: json(
			envelopeOf(z.array(ReleaseSchema), PageMetaSchema),
			"One page of each title's latest episode, the latest first.",
		),
	},
});

export const listSeasons = createRoute({
	operationId: "listSeasons",
	method: "get",
	path: "/seasons",
	tags: ["Series"],
	summary: "List anime seasons",
	description:
		"Every season some anime started in, the latest first, up to next season, whose titles are announced by now. Pass one to `browseSeries` as `season` and `season_year`.",
	responses: {
		200: json(
			envelopeOf(
				z.array(AnimeSeasonSchema),
				CountMetaSchema.extend({
					current: AnimeSeasonSchema.openapi({
						description: "The season airing now.",
					}),
				}),
			),
			"The seasons, and the one airing now.",
		),
	},
});

export const getPlayback = createRoute({
	operationId: "getPlayback",
	method: "get",
	path: "/series/{series_id}/seasons/{season_id}/episodes/{episode}/playback",
	tags: ["Playback"],
	summary: "Get everything needed to play an episode",
	description:
		"Resolves streams for every version of the episode at once, such as sub and dub, each from the first provider that can play it, with its skip segments. Sources and subtitles are URLs a player fetches directly; they expire, so resolve again rather than storing them.",
	request: {
		params: EpisodeParams,
	},
	responses: {
		200: json(
			envelopeOf(
				z.array(PlaybackMediaSchema).openapi({
					description:
						"Every English version a provider can stream right now: dub before sub before raw, so the first is the one to play by default. A version no provider can stream right now is left out. A sub carries every subtitle language its provider has, English first, and always has English: as a track, or burned into the picture when `hardsub` is true. A dub carries the sub's WebVTT tracks retimed to its own encode, when the two encodes can be aligned. Raw has none.",
				}),
				PlaybackMetaSchema,
			),
			"Streams and skip segments for every version of the episode.",
		),
		404: problem("No such season or episode in this title, or nothing streams it."),
		502: problem("Providers list the episode but none can stream it right now."),
	},
});

export const getEpisodePlayback = createRoute({
	operationId: "getEpisodePlayback",
	method: "get",
	path: "/seasons/{season_id}/episodes/{episode}/playback",
	tags: ["Playback"],
	summary: "Get everything needed to play an episode, by its season",
	description:
		"`getPlayback` addressed by the season alone, since a season ID identifies its title. `meta.next` and `meta.previous` are in this form too.",
	request: {
		params: z.object({
			season_id: SeasonIdParam,
			episode: EpisodeNumberParam,
		}),
	},
	responses: getPlayback.responses,
});

export const getStream = createRoute({
	operationId: "getStream",
	method: "get",
	path: "/streams/{token}",
	tags: ["Playback"],
	summary: "Fetch a stream resource",
	description:
		"Serves a playlist, segment, file, or subtitle through the stream proxy. `getPlayback` hands out these URLs; players fetch them directly: the token is the credential, and any origin may fetch it. Playlists reference their children by relative token, so the token must stay the last path segment. `Range` is honoured for seeking.",
	request: {
		params: z.object({
			token: z.string().openapi({
				param: {
					name: "token",
					in: "path",
				},
			}),
		}),
	},
	responses: {
		200: {
			description: "The resource.",
			content: {
				"application/vnd.apple.mpegurl": {
					schema: z.string(),
				},
				"application/octet-stream": {
					schema: z.string().openapi({
						format: "binary",
					}),
				},
			},
		},
		206: {
			description: "Part of the resource, for a `Range` request.",
		},
		403: problem("The token is forged, malformed, or expired."),
		502: problem("The upstream host failed."),
	},
});

/** Routes that need a signed-in account, as a bearer token or session cookie. */
const signedIn = [
	{
		session: [],
	},
];

const ProfileParams = z.object({
	profile_id: ProfileIdParam,
});

export const listProfiles = createRoute({
	operationId: "listProfiles",
	method: "get",
	path: "/profiles",
	tags: ["Profiles"],
	summary: "List the account's profiles",
	description:
		"Every profile of the signed-in account, oldest first. A new account starts with one.",
	security: signedIn,
	responses: {
		200: json(envelopeOf(z.array(ProfileSchema), CountMetaSchema), "The profiles."),
		401: problem("Not signed in."),
	},
});

export const createProfile = createRoute({
	operationId: "createProfile",
	method: "post",
	path: "/profiles",
	tags: ["Profiles"],
	summary: "Add a profile",
	description: "An account may hold any number of profiles.",
	security: signedIn,
	request: {
		body: {
			required: true,
			content: {
				"application/json": {
					schema: ProfileInputSchema,
				},
			},
		},
	},
	responses: {
		201: json(envelopeOf(ProfileSchema, EmptyMetaSchema), "The new profile."),
		401: problem("Not signed in."),
		422: problem("The body is invalid."),
	},
});

export const updateProfile = createRoute({
	operationId: "updateProfile",
	method: "patch",
	path: "/profiles/{profile_id}",
	tags: ["Profiles"],
	summary: "Rename or recolor a profile",
	security: signedIn,
	request: {
		params: ProfileParams,
		body: {
			required: true,
			content: {
				"application/json": {
					schema: ProfileInputSchema.partial(),
				},
			},
		},
	},
	responses: {
		200: json(envelopeOf(ProfileSchema, EmptyMetaSchema), "The profile."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
		422: problem("The body is invalid."),
	},
});

export const deleteProfile = createRoute({
	operationId: "deleteProfile",
	method: "delete",
	path: "/profiles/{profile_id}",
	tags: ["Profiles"],
	summary: "Delete a profile",
	description: "Deletes the profile with its library, progress, and history.",
	security: signedIn,
	request: {
		params: ProfileParams,
	},
	responses: {
		204: {
			description: "Deleted.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
		409: problem("The profile is the account's last; an account keeps at least one."),
	},
});

export const getContinueWatching = createRoute({
	operationId: "getContinueWatching",
	method: "get",
	path: "/profiles/{profile_id}/continue-watching",
	tags: ["Profiles"],
	summary: "Titles to pick back up",
	description:
		"One entry per recently played title, most recent first, with the episode and position to resume: an unfinished episode where it stopped, or the next episode from the start. It is read from episode progress; library status is not a way into it. The next season only follows when it was already out as the last one was finished; a season released later is not pushed here. Titles with nothing to continue, and titles dropped or dismissed from the row and not played since, are left out.",
	security: signedIn,
	request: {
		params: ProfileParams,
		query: z.object({
			series_id: commaSeparated(z.array(z.string()).min(1).max(50), "GYZJ43JMR,U06QF6S1R").openapi({
				description:
					"Only these titles, such as a title's page or a page of search results: at most one entry each, none for a title with nothing to resume.",
			}),
		}),
	},
	responses: {
		200: json(envelopeOf(z.array(ContinueWatchingItemSchema), CountMetaSchema), "The titles."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const getRecommendations = createRoute({
	operationId: "getRecommendations",
	method: "get",
	path: "/profiles/{profile_id}/recommendations",
	tags: ["Profiles"],
	summary: "Titles the profile may like",
	description:
		"Titles the profile has not played or put in its library, best fit first, from AniList users' recommendations for what it has played and has in its library and the genres those share, weighed by how well liked each title is. Completed and much-watched titles count most, recent ones more than old ones, and dropped titles count against what they are like. They are ranked on the first request of each week (Monday 06:00 UTC, as featured titles) and kept all week; a title the profile plays or lists meanwhile gives its place to the next one ranked. Empty for a profile with no history.",
	security: signedIn,
	request: {
		params: ProfileParams,
	},
	responses: {
		200: json(envelopeOf(z.array(SeriesCardSchema), CountMetaSchema), "The titles."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const getFeatured = createRoute({
	operationId: "getFeatured",
	method: "get",
	path: "/profiles/{profile_id}/featured",
	tags: ["Profiles"],
	summary: "Titles to feature",
	description:
		"Up to six titles to feature on the profile's home page, mostly new seasons and films from the last year that are well liked, then the best rated and popular hits. They are picked every Monday at 06:00 UTC, in each profile's own order, and kept all week; none is featured two weeks in a row. Titles the profile has played or put in its library are left out, as are long-running ones, those without a backdrop and logo, and those nothing streams.",
	security: signedIn,
	request: {
		params: ProfileParams,
	},
	responses: {
		200: json(envelopeOf(z.array(SeriesCardSchema), CountMetaSchema), "The titles."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const getSeriesProgress = createRoute({
	operationId: "getSeriesProgress",
	method: "get",
	path: "/profiles/{profile_id}/progress/{series_id}",
	tags: ["Profiles"],
	summary: "A title's progress",
	description:
		"The state of every episode of the title the profile played or marked watched, in title order, and what is derived from them: each season's progress, whether the profile is caught up, and where to continue. Nothing here is a library status.",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			series_id: SeriesIdParam,
		}),
	},
	responses: {
		200: json(
			envelopeOf(
				TitleProgressSchema,
				z.object({
					series_id: z.string(),
				}),
			),
			"The progress.",
		),
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or no such title."),
	},
});

export const recordProgress = createRoute({
	operationId: "recordProgress",
	method: "put",
	path: "/profiles/{profile_id}/progress",
	tags: ["Profiles"],
	summary: "Save a playback position",
	description:
		"Players report their position every few seconds while playing, and on pause and exit. An older `event_at` than the one saved changes nothing. Playing past 90% marks the episode watched, and playing a watched episode again keeps it watched. Playback goes into the profile's history, puts the title in its library as `watching` (moving it there from `planning`; any other status stays), and lifts a dismissal from continue watching.",
	security: signedIn,
	request: {
		params: ProfileParams,
		body: {
			required: true,
			content: {
				"application/json": {
					schema: ProgressUpdateSchema,
				},
			},
		},
	},
	responses: {
		204: {
			description: "Saved.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, season, or episode."),
		422: problem("The body is invalid."),
	},
});

export const getPlaybackPreferences = createRoute({
	operationId: "getPlaybackPreferences",
	method: "get",
	path: "/profiles/{profile_id}/playback-preferences",
	tags: ["Profiles"],
	summary: "How the profile likes episodes to play",
	description:
		"The audio, subtitles, and skipping the profile last picked in a player, so every episode on every device plays the same way. The defaults until it picks anything: the first version an episode has, its default subtitles, and no auto-skip.",
	security: signedIn,
	request: {
		params: ProfileParams,
	},
	responses: {
		200: json(envelopeOf(PlaybackPreferencesSchema, EmptyMetaSchema), "The preferences."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const updatePlaybackPreferences = createRoute({
	operationId: "updatePlaybackPreferences",
	method: "patch",
	path: "/profiles/{profile_id}/playback-preferences",
	tags: ["Profiles"],
	summary: "Remember what the profile picked in a player",
	description:
		"Changes only what is given. Subtitles change per audio: picking the dub's leaves the sub's as they are.",
	security: signedIn,
	request: {
		params: ProfileParams,
		body: {
			required: true,
			content: {
				"application/json": {
					schema: PlaybackPreferencesUpdateSchema,
				},
			},
		},
	},
	responses: {
		200: json(
			envelopeOf(PlaybackPreferencesSchema, EmptyMetaSchema),
			"The preferences as they now stand.",
		),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
		422: problem("The body is invalid."),
	},
});

const ProfileSeriesParams = ProfileParams.extend({
	series_id: SeriesIdParam,
});

export const dismissContinueWatching = createRoute({
	operationId: "dismissContinueWatching",
	method: "delete",
	path: "/profiles/{profile_id}/continue-watching/{series_id}",
	tags: ["Profiles"],
	summary: "Remove a title from continue watching",
	description:
		"Hides the title from continue watching until the profile plays it again. Its progress and library status stay as they are.",
	security: signedIn,
	request: {
		params: ProfileSeriesParams,
	},
	responses: {
		204: {
			description: "Dismissed.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or no such title."),
	},
});

export const markWatched = createRoute({
	operationId: "markWatched",
	method: "put",
	path: "/profiles/{profile_id}/progress/{series_id}/watched",
	tags: ["Profiles"],
	summary: "Mark an episode, season, or title watched",
	description:
		"Marks one episode, every released episode of a season, or every released episode in watch order, watched or unwatched. This is not playback: history stays as it is, and no library status such as `completed` is set, which is its own change. Marking watched does move a `planning` title to `watching`. Marking unwatched forgets the episodes' progress.",
	security: signedIn,
	request: {
		params: ProfileSeriesParams,
		body: {
			required: true,
			content: {
				"application/json": {
					schema: MarkWatchedSchema,
				},
			},
		},
	},
	responses: {
		204: {
			description: "Marked.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or no such title, season, or episode."),
		422: problem("The body is invalid."),
	},
});

export const clearProgress = createRoute({
	operationId: "clearProgress",
	method: "delete",
	path: "/profiles/{profile_id}/progress/{series_id}",
	tags: ["Profiles"],
	summary: "Forget a title's progress",
	description:
		"Forgets the state of every episode of the title, to start it over. Its library status and the profile's history of it stay as they are.",
	security: signedIn,
	request: {
		params: ProfileSeriesParams,
	},
	responses: {
		204: {
			description: "Forgotten.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or no such title."),
	},
});

export const getLibrary = createRoute({
	operationId: "getLibrary",
	method: "get",
	path: "/profiles/{profile_id}/library",
	tags: ["Profiles"],
	summary: "The profile's library",
	description:
		"Every title in the library, most recently active first, with its status and the profile's progress through it. The status follows the progress; see `LibraryStatus`.",
	security: signedIn,
	request: {
		params: ProfileParams,
		query: z.object({
			status: LibraryStatusSchema.optional().openapi({
				description: "Only titles with this status.",
			}),
		}),
	},
	responses: {
		200: json(envelopeOf(z.array(LibraryItemSchema), LibraryMetaSchema), "The titles."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const getLibraryEntry = createRoute({
	operationId: "getLibraryEntry",
	method: "get",
	path: "/profiles/{profile_id}/library/{series_id}",
	tags: ["Profiles"],
	summary: "A title's place in the profile's library",
	description: "The title's status, or null when it is not in the library.",
	security: signedIn,
	request: {
		params: ProfileSeriesParams,
	},
	responses: {
		200: json(envelopeOf(LibraryEntrySchema, EmptyMetaSchema), "The title's place."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or no such title."),
	},
});

export const addToLibrary = createRoute({
	operationId: "addToLibrary",
	method: "put",
	path: "/profiles/{profile_id}/library/{series_id}",
	tags: ["Profiles"],
	summary: "Add a title to the library",
	description:
		"Puts the title in the library as `planning`. A title already in it keeps its status.",
	security: signedIn,
	request: {
		params: ProfileSeriesParams,
	},
	responses: {
		204: {
			description: "Added, or was already there.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or no such title."),
	},
});

export const removeFromLibrary = createRoute({
	operationId: "removeFromLibrary",
	method: "delete",
	path: "/profiles/{profile_id}/library/{series_id}",
	tags: ["Profiles"],
	summary: "Remove a title from the library",
	description:
		"Takes the title out of the library. What the profile watched of it, and its history, stay.",
	security: signedIn,
	request: {
		params: ProfileSeriesParams,
	},
	responses: {
		204: {
			description: "Removed, or was not in the library.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const getNotifications = createRoute({
	operationId: "getNotifications",
	method: "get",
	path: "/profiles/{profile_id}/notifications",
	tags: ["Profiles"],
	summary: "What came out for the profile's library",
	description:
		"What came out in the last 30 days for titles in the library, whatever their status, newest first: a new season, film, or OVA, or new episodes of a season that was out already. Episodes of one season that come out together make one notification. Only what came out after the title was added is listed; titles taken out of the library drop out, and so does a notification once the profile watches one of its episodes.",
	security: signedIn,
	request: {
		params: ProfileParams,
		query: z.object({
			limit: z.coerce.number().int().min(1).max(100).optional().openapi({
				description: "At most this many notifications; 30 when omitted.",
			}),
		}),
	},
	responses: {
		200: json(
			envelopeOf(z.array(NotificationSchema), NotificationsMetaSchema),
			"The notifications.",
		),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const markNotificationsSeen = createRoute({
	operationId: "markNotificationsSeen",
	method: "put",
	path: "/profiles/{profile_id}/notifications/seen",
	tags: ["Profiles"],
	summary: "Mark all notifications read",
	description:
		"Marks every notification released at or before `seen_at` read, whatever it was marked before. It never moves back, nor past now.",
	security: signedIn,
	request: {
		params: ProfileParams,
		body: {
			required: true,
			content: {
				"application/json": {
					schema: NotificationsSeenSchema,
				},
			},
		},
	},
	responses: {
		204: {
			description: "Marked.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
		422: problem("The body is invalid."),
	},
});

export const markNotificationRead = createRoute({
	operationId: "markNotificationRead",
	method: "put",
	path: "/profiles/{profile_id}/notifications/{notification_id}/read",
	tags: ["Profiles"],
	summary: "Mark a notification read",
	description: "Marks one of the profile's notifications read.",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			notification_id: z
				.string()
				.min(1)
				.openapi({
					param: {
						name: "notification_id",
						in: "path",
					},
					description: "The notification's `id`.",
					example: "EWBMBNIV4:1790651185224",
				}),
		}),
	},
	responses: {
		204: {
			description: "Marked, or was not listed.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const dismissNotification = createRoute({
	operationId: "dismissNotification",
	method: "delete",
	path: "/profiles/{profile_id}/notifications/{notification_id}",
	tags: ["Profiles"],
	summary: "Delete a notification",
	description: "Takes the notification out of the profile's notifications for good.",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			notification_id: z
				.string()
				.min(1)
				.openapi({
					param: {
						name: "notification_id",
						in: "path",
					},
					description: "The notification's `id`.",
					example: "EWBMBNIV4:1790651185224",
				}),
		}),
	},
	responses: {
		204: {
			description: "Deleted, or was not listed.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const getHistory = createRoute({
	operationId: "getHistory",
	method: "get",
	path: "/profiles/{profile_id}/history",
	tags: ["Profiles"],
	summary: "The episodes the profile played",
	description:
		"One item per episode, most recently played first, a page at a time. Only playback appears here: episodes marked watched do not.",
	security: signedIn,
	request: {
		params: ProfileParams,
		query: z.object({
			after: z.string().optional().openapi({
				description: "Where the page starts: taken from the previous page's `next`.",
			}),
			limit: z.coerce.number().int().min(1).max(200).optional().openapi({
				description: "Items per page; 50 when omitted.",
			}),
		}),
	},
	responses: {
		200: json(envelopeOf(z.array(HistoryItemSchema), HistoryMetaSchema), "The page."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
		422: problem("`after` is not from a previous page."),
	},
});

export const forgetEpisode = createRoute({
	operationId: "forgetEpisode",
	method: "delete",
	path: "/profiles/{profile_id}/history/{season_id}/{episode}",
	tags: ["Profiles"],
	summary: "Remove an episode from history",
	description:
		"Takes the episode out of the profile's history, and forgets its state with it: where playback of it stands, and whether it is watched. The title's library status settles to match.",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			season_id: SeasonIdParam,
			episode: EpisodeNumberParam,
		}),
	},
	responses: {
		204: {
			description: "Removed, or was not in the history.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or no such season or episode."),
	},
});
