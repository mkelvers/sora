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
	ContinueWatchingSchema,
	DroppedSchema,
	HistoryItemSchema,
	HistoryMetaSchema,
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
	ProgressInputSchema,
	ProgressSchema,
	AnimeSeasonSchema,
	ReleaseSchema,
	ScheduledEpisodeSchema,
	SeasonSchema,
	SeasonEpisodeSchema,
	SeasonIdParam,
	SeriesCardSchema,
	SeriesIdParam,
	SeriesImageSchema,
	SeriesProgressSchema,
	ShowSchema,
	SeriesSchema,
	UpcomingSeriesSchema,
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

export const listUpcoming = createRoute({
	operationId: "listUpcoming",
	method: "get",
	path: "/upcoming",
	tags: ["Series"],
	summary: "Titles with something starting soon",
	description:
		"Titles with a season, film, or OVA starting within 30 days from today, on a day that is known; what is only announced, or dated to a month or year, is never listed. `returning` titles come first, then new titles, each kind the most anticipated first and at most 12. A title is returning when it has something out already; a title with nothing out that is related to one that has, such as a sequel listed as a show of its own, gives its place to the one already out, which is the one to catch up on.",
	responses: {
		200: json(envelopeOf(z.array(UpcomingSeriesSchema), CountMetaSchema), "The titles."),
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
	description: "Deletes the profile and what Sora keeps for it.",
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

export const getFeatured = createRoute({
	operationId: "getFeatured",
	method: "get",
	path: "/profiles/{profile_id}/featured",
	tags: ["Profiles"],
	summary: "Titles to feature",
	description:
		"Up to six titles to feature on the profile's home page, mostly new seasons and films from the last year that are well liked, then the best rated and popular hits. They are picked every Monday at 06:00 UTC, in each profile's own order, and kept all week; none is featured two weeks in a row. Long-running titles are left out, as are those without a backdrop and logo, and those nothing streams.",
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

/** An episode, addressed by its season, under the profile whose progress it is. */
const ProfileEpisodeParams = ProfileParams.extend({
	season_id: SeasonIdParam,
	episode: EpisodeNumberParam,
});

export const getProgress = createRoute({
	operationId: "getProgress",
	method: "get",
	path: "/profiles/{profile_id}/seasons/{season_id}/episodes/{episode}/progress",
	tags: ["Profiles"],
	summary: "How far the profile is into an episode",
	description:
		"Where the profile stopped in the episode, to resume it from there, or null when the profile never played it.",
	security: signedIn,
	request: {
		params: ProfileEpisodeParams,
	},
	responses: {
		200: json(envelopeOf(ProgressSchema.nullable(), EmptyMetaSchema), "The progress."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const saveProgress = createRoute({
	operationId: "saveProgress",
	method: "put",
	path: "/profiles/{profile_id}/seasons/{season_id}/episodes/{episode}/progress",
	tags: ["Profiles"],
	summary: "Remember where the profile stopped in an episode",
	description:
		"Replaces what was remembered for the episode. A player sends it every few seconds while the episode plays, and when it is paused, left, or ends, and says each time whether the episode is over at that point.",
	security: signedIn,
	request: {
		params: ProfileEpisodeParams,
		body: {
			required: true,
			content: {
				"application/json": {
					schema: ProgressInputSchema,
				},
			},
		},
	},
	responses: {
		200: json(envelopeOf(ProgressSchema, EmptyMetaSchema), "The progress as it now stands."),
		401: problem("Not signed in."),
		404: problem(
			"The account has no such profile, or the season has no such episode that can be played.",
		),
		422: problem("The body is invalid."),
	},
});

export const getSeriesProgress = createRoute({
	operationId: "getSeriesProgress",
	method: "get",
	path: "/profiles/{profile_id}/series/{series_id}/progress",
	tags: ["Profiles"],
	summary: "How far the profile is through a show",
	description:
		"The profile's progress in every episode of the show it played, to mark them in an episode list, and the episode to play next.",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			series_id: SeriesIdParam,
		}),
	},
	responses: {
		200: json(envelopeOf(SeriesProgressSchema, EmptyMetaSchema), "The progress."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or the series does not exist."),
	},
});

export const listContinueWatching = createRoute({
	operationId: "listContinueWatching",
	method: "get",
	path: "/profiles/{profile_id}/continue-watching",
	tags: ["Profiles"],
	summary: "Shows the profile is in the middle of",
	description:
		"The shows the profile is in the middle of, the most recently played first, each with the episode to play next. A show is judged by the episode played last: while it is unfinished it is the one to play, and once it is finished the episode after it is, into the next season in watch order. A show with no episode after it is left out until one comes out. Only the 30 most recently played shows are looked at.",
	security: signedIn,
	request: {
		params: ProfileParams,
	},
	responses: {
		200: json(envelopeOf(z.array(ContinueWatchingSchema), CountMetaSchema), "The shows."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const listShows = createRoute({
	operationId: "listShows",
	method: "get",
	path: "/profiles/{profile_id}/shows",
	tags: ["Profiles"],
	summary: "The profile's Shows",
	description:
		"The series the profile saved to watch later, and the ones it started watching, the most recently active first. A series is listed once however many of its seasons the profile watched. Dropped series are among them, marked as such.",
	security: signedIn,
	request: {
		params: ProfileParams,
	},
	responses: {
		200: json(envelopeOf(z.array(ShowSchema), CountMetaSchema), "The shows."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const addShow = createRoute({
	operationId: "addShow",
	method: "put",
	path: "/profiles/{profile_id}/shows/{series_id}",
	tags: ["Profiles"],
	summary: "Save a series to the profile's Shows",
	description:
		"A series already there stays as it is. Playing an episode of a series saves it too, so this is only needed for one to watch later.",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			series_id: SeriesIdParam,
		}),
	},
	responses: {
		204: {
			description: "Saved, or was there already.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or the series does not exist."),
	},
});

export const removeShow = createRoute({
	operationId: "removeShow",
	method: "delete",
	path: "/profiles/{profile_id}/shows/{series_id}",
	tags: ["Profiles"],
	summary: "Take a series out of the profile's Shows",
	description:
		"Takes the series out of the profile's Shows, and with it out of `listContinueWatching`. The profile's progress and history in it stay, so playing an episode of it brings it back where the profile left off.",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			series_id: SeriesIdParam,
		}),
	},
	responses: {
		204: {
			description: "Taken out, or was not there.",
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
	summary: "The episodes the profile watched",
	description:
		"One item per episode, the most recently finished first, a page at a time. An episode is listed at when the profile first finished it: playing it again neither lists it again nor moves it up. An episode marked watched is listed at when it was marked.",
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

export const dismissContinueWatching = createRoute({
	operationId: "dismissContinueWatching",
	method: "delete",
	path: "/profiles/{profile_id}/continue-watching/{series_id}",
	tags: ["Profiles"],
	summary: "Take a show's card out of Continue Watching",
	description:
		"Takes the show out of `listContinueWatching`. The profile's progress and history in it stay, and so does the show in its Shows; playing or marking an episode of it brings it back.",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			series_id: SeriesIdParam,
		}),
	},
	responses: {
		204: {
			description: "Taken out, or was not listed.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

/** A season, under the profile that watched it. */
const ProfileSeasonParams = ProfileParams.extend({
	season_id: SeasonIdParam,
});

export const markSeason = createRoute({
	operationId: "markSeason",
	method: "put",
	path: "/profiles/{profile_id}/seasons/{season_id}/watched",
	tags: ["Profiles"],
	summary: "Mark a season watched",
	description:
		"Marks every episode of the season that can be played as watched, without playing them, and saves the series to the profile's Shows. Episodes the profile finished stay as they are. The marked episodes enter `getHistory` at the time of marking.",
	security: signedIn,
	request: {
		params: ProfileSeasonParams,
	},
	responses: {
		204: {
			description: "Marked.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or the season does not exist."),
	},
});

export const unmarkSeason = createRoute({
	operationId: "unmarkSeason",
	method: "delete",
	path: "/profiles/{profile_id}/seasons/{season_id}/watched",
	tags: ["Profiles"],
	summary: "Make a season unwatched",
	description:
		"Forgets which episodes of the season the profile watched, finished or marked, and where it stopped in them, which takes them out of its history.",
	security: signedIn,
	request: {
		params: ProfileSeasonParams,
	},
	responses: {
		204: {
			description: "Forgotten.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or the season does not exist."),
	},
});

export const getDropped = createRoute({
	operationId: "getDropped",
	method: "get",
	path: "/profiles/{profile_id}/dropped",
	tags: ["Profiles"],
	summary: "The series the profile dropped",
	description:
		"The IDs of the series the profile dropped, and of the stored series related to them, to leave both out of what is suggested to the profile.",
	security: signedIn,
	request: {
		params: ProfileParams,
	},
	responses: {
		200: json(envelopeOf(DroppedSchema, EmptyMetaSchema), "The series."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const dropShow = createRoute({
	operationId: "dropShow",
	method: "put",
	path: "/profiles/{profile_id}/dropped/{series_id}",
	tags: ["Profiles"],
	summary: "Drop a series",
	description:
		"Drops the whole series for the profile, and saves it to its Shows so it can be found there. Its progress and history stay. The series leaves `listContinueWatching`, and it and the series related to it are no longer featured. Only `undropShow` ends a drop: new episodes do not, and neither does playing one.",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			series_id: SeriesIdParam,
		}),
	},
	responses: {
		204: {
			description: "Dropped, or was already.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or the series does not exist."),
	},
});

export const undropShow = createRoute({
	operationId: "undropShow",
	method: "delete",
	path: "/profiles/{profile_id}/dropped/{series_id}",
	tags: ["Profiles"],
	summary: "End the drop of a series",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			series_id: SeriesIdParam,
		}),
	},
	responses: {
		204: {
			description: "No longer dropped, or was not.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const markEpisode = createRoute({
	operationId: "markEpisode",
	method: "put",
	path: "/profiles/{profile_id}/seasons/{season_id}/episodes/{episode}/watched",
	tags: ["Profiles"],
	summary: "Mark an episode watched",
	description:
		"Marks the episode as watched without playing it, and saves its series to the profile's Shows. An episode the profile finished stays as it is. The episode enters `getHistory` at the time of marking.",
	security: signedIn,
	request: {
		params: ProfileEpisodeParams,
	},
	responses: {
		204: {
			description: "Marked.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or the season has no such playable episode."),
	},
});

export const unmarkEpisode = createRoute({
	operationId: "unmarkEpisode",
	method: "delete",
	path: "/profiles/{profile_id}/seasons/{season_id}/episodes/{episode}/watched",
	tags: ["Profiles"],
	summary: "Make an episode unwatched",
	description:
		"Takes the episode out of the profile's history, and forgets where it stopped in it.",
	security: signedIn,
	request: {
		params: ProfileEpisodeParams,
	},
	responses: {
		204: {
			description: "Forgotten, or was not watched.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});
