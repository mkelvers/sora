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
	EpisodeNumberParam,
	EpisodeSchema,
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
	SeriesCardSchema,
	SeriesIdParam,
	SeriesImageSchema,
	SeriesProgressSchema,
	SeriesSchema,
	UpcomingSeriesSchema,
	NotificationSchema,
	NotificationsMetaSchema,
	NotificationsReadSchema,
	WatchlistEntrySchema,
	WatchlistStatusSchema,
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

/** A title, by its series ID. */
const SeriesParams = z.object({
	series_id: SeriesIdParam,
});

/** A page of title cards. */
const SeriesPageSchema = envelopeOf(z.array(SeriesCardSchema), PageMetaSchema);

/** Nothing to say about the response beyond its results. */
const EmptyMetaSchema = z.object({}).openapi("EmptyMeta");

/** An episode, addressed under its series. */
const EpisodeParams = SeriesParams.extend({
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
	description:
		"The title's page: details, artwork, the next episode, and the other titles of its franchise. A title is one AniList entry, so a show's seasons, films, and OVAs are each a title, found from one another under `related`.",
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
							"Whether the title carries its episodes, as `listEpisodes` lists them, so a title's page needs one request.",
						example: true,
					}),
			})
			.strict(),
	},
	responses: {
		200: json(
			envelopeOf(
				SeriesSchema.extend({
					episodes: z.array(EpisodeSchema).optional().openapi({
						description:
							"The title's episodes, numbered from 1; present only with `episodes=true`.",
					}),
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

export const listEpisodes = createRoute({
	operationId: "listEpisodes",
	method: "get",
	path: "/series/{series_id}/episodes",
	tags: ["Series"],
	summary: "List a series' episodes",
	request: {
		params: SeriesParams,
	},
	responses: {
		200: json(
			envelopeOf(
				z.array(EpisodeSchema),
				CountMetaSchema.extend({
					series_id: z.string(),
				}),
			),
			"The title's episodes, numbered from 1.",
		),
		404: problem("No such title."),
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
		"The titles with an episode out in the last 30 days, each with its latest episode that can be watched, the latest first. A new episode of a show counts, not only a new title; an episode that has aired but cannot be played yet is left out until it can. `format` and `audio` apply to the title.",
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
		"Titles starting within 30 days from today, on a day that is known, whatever they are: a season, a film, or an OVA. What is only announced, or dated to a month or year, is never listed. `returning` titles come first, then new titles, each kind the most anticipated first and at most 12. A title is returning when its franchise has something out already; the earliest title of the franchise that is out is listed in its place, since that is where catching up starts.",
	responses: {
		200: json(envelopeOf(z.array(UpcomingSeriesSchema), CountMetaSchema), "The titles."),
	},
});

export const getPlayback = createRoute({
	operationId: "getPlayback",
	method: "get",
	path: "/series/{series_id}/episodes/{episode}/playback",
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
		404: problem("No such title, no such episode in it, or nothing streams it."),
		502: problem("Providers list the episode but none can stream it right now."),
	},
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

/** An episode, addressed under its series, under the profile whose progress it is. */
const ProfileEpisodeParams = ProfileParams.extend({
	series_id: SeriesIdParam,
	episode: EpisodeNumberParam,
});

export const getProgress = createRoute({
	operationId: "getProgress",
	method: "get",
	path: "/profiles/{profile_id}/series/{series_id}/episodes/{episode}/progress",
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
	path: "/profiles/{profile_id}/series/{series_id}/episodes/{episode}/progress",
	tags: ["Profiles"],
	summary: "Remember where the profile stopped in an episode",
	description:
		"Replaces what was remembered for the episode. A player sends it every few seconds while the episode plays, and when it is paused, left, or ends, and says each time whether the episode is over at that point. Stopping at second 0 of an unfinished episode is not remembered, since opening an episode is not watching it, and a finished episode stays as it was unless it is finished again. During a rewatch (see `startRewatch`) this is the rewatch's progress.",
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
		200: json(
			envelopeOf(ProgressSchema.nullable(), EmptyMetaSchema),
			"The progress as it now stands; null when the episode was never played past its start.",
		),
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or the series has no such episode."),
		422: problem("The body is invalid."),
	},
});

export const getSeriesProgress = createRoute({
	operationId: "getSeriesProgress",
	method: "get",
	path: "/profiles/{profile_id}/series/{series_id}/progress",
	tags: ["Profiles"],
	summary: "How far the profile is through a title",
	description:
		"The profile's progress in every episode of the title it played, to mark them in an episode list, and the episode to play next.",
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

export const removeProgress = createRoute({
	operationId: "removeProgress",
	method: "delete",
	path: "/profiles/{profile_id}/series/{series_id}/progress",
	tags: ["Profiles"],
	summary: "Forget the profile's progress in a title",
	description:
		"Forgets the profile's progress in every episode of the title, in its first viewing and any rewatch, which takes it out of `listContinueWatching`.",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			series_id: SeriesIdParam,
		}),
	},
	responses: {
		204: {
			description: "Forgotten.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or the series does not exist."),
	},
});

export const markSeriesWatched = createRoute({
	operationId: "markSeriesWatched",
	method: "put",
	path: "/profiles/{profile_id}/series/{series_id}/watched",
	tags: ["Profiles"],
	summary: "Mark a title watched",
	description:
		"Marks every episode the title lists watched without playing them, as if each had been played to its end just now. The watchlist status moves on as finishing them would. During a rewatch it ends the rewatch instead: its progress is forgotten, and only episodes the first viewing left unfinished are marked, so the rest keep when they were watched. `removeProgress` marks the title unwatched.",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			series_id: SeriesIdParam,
		}),
	},
	responses: {
		204: {
			description: "Marked.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or the series does not exist."),
	},
});

export const markEpisodeWatched = createRoute({
	operationId: "markEpisodeWatched",
	method: "put",
	path: "/profiles/{profile_id}/series/{series_id}/episodes/{episode}/watched",
	tags: ["Profiles"],
	summary: "Mark an episode watched",
	description:
		"Marks the episode watched without playing it, as if it had been played to its end just now, in the rewatch the profile is in the middle of, if any. The watchlist status moves on as finishing it would.",
	security: signedIn,
	request: {
		params: ProfileEpisodeParams,
	},
	responses: {
		204: {
			description: "Marked.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or the series has no such episode."),
	},
});

export const markEpisodeUnwatched = createRoute({
	operationId: "markEpisodeUnwatched",
	method: "delete",
	path: "/profiles/{profile_id}/series/{series_id}/episodes/{episode}/watched",
	tags: ["Profiles"],
	summary: "Mark an episode unwatched",
	description:
		"Forgets the profile's progress in the episode, so it is neither watched nor started: in the rewatch the profile is in the middle of, if any, else in its first viewing.",
	security: signedIn,
	request: {
		params: ProfileEpisodeParams,
	},
	responses: {
		204: {
			description: "Marked.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or the series has no such episode."),
	},
});

export const startRewatch = createRoute({
	operationId: "startRewatch",
	method: "post",
	path: "/profiles/{profile_id}/series/{series_id}/rewatch",
	tags: ["Profiles"],
	summary: "Watch a title again from the start",
	description:
		"Starts watching the title again from its first episode. Until the profile finishes its last episode again, or marks the title watched, what it plays is remembered apart from its first viewing, which stays as it was, and the progress and episode to play next in `getSeriesProgress` follow it (see `rewatch_started_at`).",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			series_id: SeriesIdParam,
		}),
	},
	responses: {
		204: {
			description: "Started.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or the series does not exist."),
	},
});

export const listContinueWatching = createRoute({
	operationId: "listContinueWatching",
	method: "get",
	path: "/profiles/{profile_id}/continue-watching",
	tags: ["Profiles"],
	summary: "Titles the profile is in the middle of",
	description:
		"The titles the profile is in the middle of, the most recently played first, each with the episode to play next. A title is judged by the episode played last: while it is unfinished it is the one to play, and once it is finished the episode after it is. A title with no episode after it is left out until one comes out; finishing it never leads on into another title, such as its next season. Only the 30 most recently played titles are looked at.",
	security: signedIn,
	request: {
		params: ProfileParams,
	},
	responses: {
		200: json(envelopeOf(z.array(ContinueWatchingSchema), CountMetaSchema), "The titles."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const dismissContinueWatching = createRoute({
	operationId: "dismissContinueWatching",
	method: "delete",
	path: "/profiles/{profile_id}/continue-watching/{series_id}",
	tags: ["Profiles"],
	summary: "Take a title's card out of Continue Watching",
	description:
		"Takes the title out of `listContinueWatching`. The profile's progress in it stays, and so does its place on the watchlist; playing an episode of it brings it back.",
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

export const listWatchlist = createRoute({
	operationId: "listWatchlist",
	method: "get",
	path: "/profiles/{profile_id}/watchlist",
	tags: ["Profiles"],
	summary: "The profile's watchlist",
	description:
		"Every title on the profile's watchlist with its status, the one whose status changed last first.",
	security: signedIn,
	request: {
		params: ProfileParams,
	},
	responses: {
		200: json(envelopeOf(z.array(WatchlistEntrySchema), CountMetaSchema), "The watchlist."),
		401: problem("Not signed in."),
		404: problem("The account has no such profile."),
	},
});

export const setWatchlistStatus = createRoute({
	operationId: "setWatchlistStatus",
	method: "put",
	path: "/profiles/{profile_id}/watchlist/{series_id}",
	tags: ["Profiles"],
	summary: "Put a title on the watchlist with a status",
	description:
		"Puts the title on the profile's watchlist with the status given, or changes the status of one already there.",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			series_id: SeriesIdParam,
		}),
		body: {
			required: true,
			content: {
				"application/json": {
					schema: z.object({
						status: WatchlistStatusSchema,
					}),
				},
			},
		},
	},
	responses: {
		204: {
			description: "Set.",
		},
		401: problem("Not signed in."),
		404: problem("The account has no such profile, or the series does not exist."),
		422: problem("The body is invalid."),
	},
});

export const removeFromWatchlist = createRoute({
	operationId: "removeFromWatchlist",
	method: "delete",
	path: "/profiles/{profile_id}/watchlist/{series_id}",
	tags: ["Profiles"],
	summary: "Take a title off the watchlist",
	description: "Takes the title off the profile's watchlist. The profile's progress in it stays.",
	security: signedIn,
	request: {
		params: ProfileParams.extend({
			series_id: SeriesIdParam,
		}),
	},
	responses: {
		204: {
			description: "Removed.",
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
	summary: "What came out for the profile's watchlist",
	description:
		"What came out in the last 30 days for the titles on the profile's watchlist, newest first: new episodes, the English dub of episodes that were out already, and the premiere of a sequel or prequel of a title on it as an offer of the next season. Episodes of one title that come out together make one notification. A title is notified of only what came out after it was put on the watchlist, and not at all when it is `dropped`. A notification goes once the profile plays one of its episodes, or deletes it.",
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

export const markNotificationsRead = createRoute({
	operationId: "markNotificationsRead",
	method: "put",
	path: "/profiles/{profile_id}/notifications/read",
	tags: ["Profiles"],
	summary: "Mark notifications read",
	description:
		"Marks the given notifications read. One that is not listed, or already read, is left as it is.",
	security: signedIn,
	request: {
		params: ProfileParams,
		body: {
			required: true,
			content: {
				"application/json": {
					schema: NotificationsReadSchema,
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
					example: "EWBMBNIV4:13",
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
