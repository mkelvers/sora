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
import { BrowseQuerySchema } from "@sora/core/catalog/browse-query";
import { SignedInDeviceSchema } from "@sora/core/models/device";
import {
	ContinueWatchingSchema,
	NotificationSchema,
	PlaybackPreferencesUpdateSchema,
	PlaybackPreferencesSchema,
	ProfilePreferencesSchema,
	ProfilePreferencesUpdateSchema,
	ProgressInputSchema,
	ProgressSchema,
	SeriesProgressSchema,
	WatchlistEntrySchema,
	WatchlistStatusEntrySchema,
	WatchlistStatusSchema,
} from "@sora/core/models/library";
import { PlaybackMediaSchema } from "@sora/core/models/playback";
import { ProfileInputSchema, ProfileSchema } from "@sora/core/models/profile";
import {
	ArtworkChangesSchema,
	AnimeSeasonSchema,
	EpisodeSchema,
	ImageTypeSchema,
	ReleaseSchema,
	ScheduledEpisodeSchema,
	CalendarSchema,
	SeriesCardSchema,
	SeriesImageSchema,
	SeriesSchema,
	RecommendationRowSchema,
	UpcomingSeriesSchema,
	UpscaleBackdropSchema,
} from "@sora/core/models/series";
import {
	ImportAuthorizationUrlSchema,
	ImportAuthorizeRequestSchema,
	ImportOptionsSchema,
	LibraryExportSchema,
	LibraryImportReportSchema,
	LibraryImportSchema,
} from "@sora/core/models/transfer";

import { CountMetaSchema, envelopeOf, OffsetMetaSchema, PageMetaSchema } from "./envelope";
import {
	EpisodeNumberParam,
	json,
	NotificationsMetaSchema,
	NotificationsReadSchema,
	PlaybackMetaSchema,
	problem,
	ProfileIdParam,
	SeriesIdParam,
} from "./schemas";

const { shape: browse } = BrowseQuerySchema;

/** A comma-separated query value, such as `genres=Action,Comedy`, as a list. */
const commaSeparated = <TList extends z.ZodType<unknown, string[]>>(list: TList, example: string) =>
	z
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
			example,
			type: "string",
		});

/**
 * The core's browse filters as query parameters in snake_case, without the
 * free-text search, which is its own route. Query strings carry every value
 * as text, so numbers and lists are parsed before the core's own rules
 * apply; the core supplies defaults. Unknown parameters are rejected: a
 * misspelled one would otherwise return the unfiltered catalog.
 */
const BrowseParams = BrowseQuerySchema.omit({
	perPage: true,
	search: true,
	seasonYear: true,
})
	.strict()
	.extend({
		format: commaSeparated(browse.format.unwrap(), "TV,MOVIE"),
		genres: commaSeparated(browse.genres.unwrap(), "Action,Fantasy"),
		page: z.coerce.number().pipe(browse.page.unwrap()).optional(),
		per_page: z.coerce.number().pipe(browse.perPage.unwrap()).optional(),
		season_year: z.coerce.number().pipe(browse.seasonYear.unwrap()).optional(),
	});

/** {@link BrowseParams} with the search text, which is required. */
const SearchParams = BrowseParams.extend({
	q: browse.search.unwrap().meta({
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

/** Routes that need a signed-in account, as a bearer token or session cookie. */
const signedIn = [
	{
		session: [],
	},
];

const ProfileParams = z.object({
	profile_id: ProfileIdParam,
});

/** An episode, addressed under its series, under the profile whose progress it is. */
const ProfileEpisodeParams = ProfileParams.extend({
	episode: EpisodeNumberParam,
	series_id: SeriesIdParam,
});

/**
 * Every `/v1` route by its operation name, which `@sora/sdk` calls them by.
 * Importing this starts no server and touches no database.
 */
export const route = {
	authorizeImport: createRoute({
		description:
			"Where to send the person to connect an AniList or MyAnimeList account and agree to Sora reading their list. The browser makes `state` and `code_challenge` itself and keeps them: when the site sends the person back to `redirect_uri` with a `code`, they go to `importLibrary` with it, together with the secret `code_challenge` was made from (`code_verifier`). Sora uses the code once and keeps nothing.",
		method: "post",
		operationId: "authorizeImport",
		path: "/library/import-authorization",
		request: {
			body: {
				content: {
					"application/json": {
						schema: ImportAuthorizeRequestSchema,
					},
				},
				required: true,
			},
		},
		responses: {
			200: json(envelopeOf(ImportAuthorizationUrlSchema, EmptyMetaSchema), "Where to send them."),
			401: problem("Not signed in."),
			422: problem("The body is invalid, or that account is not set up on this Sora."),
		},
		security: signedIn,
		summary: "Start connecting an account to import from",
		tags: ["Profiles"],
	}),

	browseSeries: createRoute({
		description:
			"Filters and sorts the catalog; `searchSeries` searches it by text. One card per title: a show appears once, not once per season. A page can hold fewer cards than `per_page` when several AniList entries belong to one title, and titles not prepared yet may be missing while they are prepared in the background.",
		method: "get",
		operationId: "browseSeries",
		path: "/series",
		request: {
			query: BrowseParams,
		},
		responses: {
			200: json(SeriesPageSchema, "A page of titles."),
			422: problem("The query is invalid."),
			503: problem("The catalog upstream is unavailable; retry after `Retry-After`."),
		},
		summary: "Browse series",
		tags: ["Series"],
	}),

	createProfile: createRoute({
		description: "An account may hold any number of profiles.",
		method: "post",
		operationId: "createProfile",
		path: "/profiles",
		request: {
			body: {
				content: {
					"application/json": {
						schema: ProfileInputSchema,
					},
				},
				required: true,
			},
		},
		responses: {
			201: json(envelopeOf(ProfileSchema, EmptyMetaSchema), "The new profile."),
			401: problem("Not signed in."),
			422: problem("The body is invalid."),
		},
		security: signedIn,
		summary: "Add a profile",
		tags: ["Profiles"],
	}),

	deleteProfile: createRoute({
		description: "Deletes the profile and what Sora keeps for it.",
		method: "delete",
		operationId: "deleteProfile",
		path: "/profiles/{profile_id}",
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
		security: signedIn,
		summary: "Delete a profile",
		tags: ["Profiles"],
	}),

	dismissContinueWatching: createRoute({
		description:
			"Takes the title out of `listContinueWatching`. The profile's progress in it stays, and so does its place on the watchlist; playing an episode of it brings it back.",
		method: "delete",
		operationId: "dismissContinueWatching",
		path: "/profiles/{profile_id}/continue-watching/{series_id}",
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
		security: signedIn,
		summary: "Take a title's card out of Continue Watching",
		tags: ["Profiles"],
	}),

	dismissNotification: createRoute({
		description: "Takes the notification out of the profile's notifications for good.",
		method: "delete",
		operationId: "dismissNotification",
		path: "/profiles/{profile_id}/notifications/{notification_id}",
		request: {
			params: ProfileParams.extend({
				notification_id: z
					.string()
					.min(1)
					.openapi({
						description: "The notification's `id`.",
						example: "EWBMBNIV4:13",
						param: {
							in: "path",
							name: "notification_id",
						},
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
		security: signedIn,
		summary: "Delete a notification",
		tags: ["Profiles"],
	}),

	exportLibrary: createRoute({
		description:
			"The profile's watchlist and its history of played episodes as one document, by AniList ID so it can move between Sora installs. Hand it back to `importLibrary` to restore it.",
		method: "get",
		operationId: "exportLibrary",
		path: "/profiles/{profile_id}/library/export",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(LibraryExportSchema, EmptyMetaSchema), "The document."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Export the profile's watchlist and history",
		tags: ["Profiles"],
	}),

	getBackdrop: createRoute({
		description:
			"An upscaled backdrop, as `upscaleBackdrop` made it. The web app serves it at `/api/backdrops/{id}`, which is where `SeriesImage.upscaled_url` points.",
		method: "get",
		operationId: "getBackdrop",
		path: "/backdrops/{id}",
		request: {
			params: z.object({
				id: z.uuid().openapi({
					param: {
						in: "path",
						name: "id",
					},
				}),
			}),
		},
		responses: {
			200: {
				content: {
					"image/jpeg": {
						schema: z.string().openapi({
							format: "binary",
						}),
					},
				},
				description: "The backdrop.",
			},
			404: problem("No such upscaled backdrop, or it is not ready."),
		},
		summary: "An upscaled backdrop",
		tags: ["Series"],
	}),

	getCalendar: createRoute({
		description:
			"A week of `getSchedule` laid out in a time zone, Monday to Sunday: each day's times and what comes out at each, with a title's subbed and dubbed episodes merged when they are the same ones.",
		method: "get",
		operationId: "getCalendar",
		path: "/calendar",
		request: {
			query: z.object({
				time_zone: z.string().min(1).max(100).meta({
					description: "An IANA time zone.",
					example: "Europe/Oslo",
				}),
				week: z.coerce.number().int().min(-520).max(520).default(0).meta({
					description: "How many weeks after this one; negative for earlier weeks.",
				}),
			}),
		},
		responses: {
			200: json(envelopeOf(CalendarSchema, EmptyMetaSchema), "The week."),
			422: problem("The time zone is unknown."),
		},
		summary: "Release calendar",
		tags: ["Series"],
	}),

	getEpisode: createRoute({
		method: "get",
		operationId: "getEpisode",
		path: "/series/{series_id}/episodes/{episode}",
		request: {
			params: EpisodeParams,
		},
		responses: {
			200: json(
				envelopeOf(EpisodeSchema, EmptyMetaSchema),
				"The episode, as `listEpisodes` lists it.",
			),
			404: problem("No such title, or it does not list the episode."),
		},
		summary: "Get one of a series' episodes",
		tags: ["Series"],
	}),

	getFeatured: createRoute({
		description:
			"Up to six titles to feature on the profile's home page: what is popular right now, seasons and films that are airing or started in the last year and are well liked, never old favourites without a new season. They are picked every day at 06:00 UTC, in each profile's own order, and kept all day. A title is rested for a week after it was featured unless too few others are current. Long-running titles are left out, as are those without a backdrop and logo, and those nothing streams.",
		method: "get",
		operationId: "getFeatured",
		path: "/profiles/{profile_id}/featured",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(z.array(SeriesCardSchema), CountMetaSchema), "The titles."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Titles to feature",
		tags: ["Profiles"],
	}),

	getImportOptions: createRoute({
		description:
			"Which accounts people can connect to import from on this Sora. An account is on when its client is set up; otherwise the list is imported from a username or a file.",
		method: "get",
		operationId: "getImportOptions",
		path: "/library/import-options",
		responses: {
			200: json(envelopeOf(ImportOptionsSchema, EmptyMetaSchema), "What is set up."),
			401: problem("Not signed in."),
		},
		security: signedIn,
		summary: "Which accounts can be connected to import from",
		tags: ["Profiles"],
	}),

	getNotifications: createRoute({
		description:
			"What came out in the last 30 days for titles the profile saved or played and their connected sequels and prequels, newest first: premieres, new episodes, and English dubs of episodes that were out already. Connected seasons do not need to be on the watchlist. Episodes of one title that come out together make one notification. Only releases after the earliest watchlist or recorded playback time in the connected seasons qualify. Dropped titles do not start following or receive notifications, even with playback progress. A regular release notification goes once the profile plays one of its episodes, or deletes it; a dub stays after playback.",
		method: "get",
		operationId: "getNotifications",
		path: "/profiles/{profile_id}/notifications",
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
		security: signedIn,
		summary: "What came out for the shows the profile follows",
		tags: ["Profiles"],
	}),

	getPlayback: createRoute({
		description:
			"Resolves streams for every version of the episode at once, such as sub and dub, each from the first provider that can play it, with its skip segments. Sources and subtitles are URLs a player fetches directly; they expire, so resolve again rather than storing them.",
		method: "get",
		operationId: "getPlayback",
		path: "/series/{series_id}/episodes/{episode}/playback",
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
		summary: "Get everything needed to play an episode",
		tags: ["Playback"],
	}),

	getPlaybackPreferences: createRoute({
		description:
			"The audio, subtitles, and skipping the profile last picked in a player, so every episode on every device plays the same way. The defaults until it picks anything: the first version an episode has, its default subtitles, and no auto-skip.",
		method: "get",
		operationId: "getPlaybackPreferences",
		path: "/profiles/{profile_id}/playback-preferences",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(PlaybackPreferencesSchema, EmptyMetaSchema), "The preferences."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "How the profile likes episodes to play",
		tags: ["Profiles"],
	}),

	getProfilePreferences: createRoute({
		description:
			"How the profile wants Sora to look and what it wants to hear about: whether unwatched episodes hide their picture, title and summary, and which kinds of release are notifications. The defaults until it picks anything: nothing hidden and every kind on.",
		method: "get",
		operationId: "getProfilePreferences",
		path: "/profiles/{profile_id}/preferences",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(ProfilePreferencesSchema, EmptyMetaSchema), "The preferences."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "The profile's display and notification preferences",
		tags: ["Profiles"],
	}),

	getProgress: createRoute({
		description:
			"Where the profile stopped in the episode, to resume it from there, or null when the profile never played it.",
		method: "get",
		operationId: "getProgress",
		path: "/profiles/{profile_id}/series/{series_id}/episodes/{episode}/progress",
		request: {
			params: ProfileEpisodeParams,
		},
		responses: {
			200: json(envelopeOf(ProgressSchema.nullable(), EmptyMetaSchema), "The progress."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "How far the profile is into an episode",
		tags: ["Profiles"],
	}),

	getSchedule: createRoute({
		description:
			"Episodes coming out in a window of up to 14 days, in order, as AnimeSchedule's timetable has them: each once subbed and once dubbed, as it comes out. A raw broadcast counts as subbed, timed by the official subbed stream where there is one. Last week to next week are kept current. Defaults to the next 7 days.",
		method: "get",
		operationId: "getSchedule",
		path: "/schedule",
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
		summary: "Release schedule",
		tags: ["Series"],
	}),

	getSeries: createRoute({
		description:
			"The title's page: details, artwork, the next episode, and the other titles of its franchise. A title is one AniList entry, so a show's seasons, films, and OVAs are each a title, found from one another under `related`.",
		method: "get",
		operationId: "getSeries",
		path: "/series/{series_id}",
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
							description:
								"Whether the title carries its episodes, as `listEpisodes` lists them, so a title's page needs one request.",
							example: true,
							type: "boolean",
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
		summary: "Get a series",
		tags: ["Series"],
	}),

	getSeriesProgress: createRoute({
		description:
			"The profile's progress in every episode of the title it played, to mark them in an episode list, and the episode to play next.",
		method: "get",
		operationId: "getSeriesProgress",
		path: "/profiles/{profile_id}/series/{series_id}/progress",
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
		security: signedIn,
		summary: "How far the profile is through a title",
		tags: ["Profiles"],
	}),

	getStream: createRoute({
		description:
			"Serves a playlist, segment, file, or subtitle through the stream proxy. `getPlayback` hands out these URLs. Only the Sora web app's server may call this and `getPlayback`, with its client key in `X-Sora-Client-Key`, for the account the token was issued to; players reach it through the web app, never directly. Playlists reference their children by relative token, so the token must stay the last path segment. `Range` is honoured for seeking.",
		method: "get",
		operationId: "getStream",
		path: "/streams/{token}",
		request: {
			params: z.object({
				token: z.string().openapi({
					param: {
						in: "path",
						name: "token",
					},
				}),
			}),
		},
		responses: {
			200: {
				content: {
					"application/octet-stream": {
						schema: z.string().openapi({
							format: "binary",
						}),
					},
					"application/vnd.apple.mpegurl": {
						schema: z.string(),
					},
				},
				description: "The resource.",
			},
			206: {
				description: "Part of the resource, for a `Range` request.",
			},
			403: problem("The token is forged, malformed, or expired."),
			502: problem("The upstream host failed."),
		},
		summary: "Fetch a stream resource",
		tags: ["Playback"],
	}),

	importLibrary: createRoute({
		description:
			"Adds what another place keeps to the profile: a document from `exportLibrary`, an AniList user's public anime list, or a MyAnimeList `animelist` export. It only adds. A title already on the watchlist keeps its status, an episode already played keeps where it was, and importing the same thing twice changes nothing the second time. From another site, each title is put on the watchlist with its status (on hold and rewatching count as watching) and the episodes up to the ones watched are marked watched; a completed title has every released episode marked. Titles Sora does not hold yet are listed in the report and queued to be added, so importing again later takes them.",
		method: "post",
		operationId: "importLibrary",
		path: "/profiles/{profile_id}/library/import",
		request: {
			body: {
				content: {
					"application/json": {
						schema: LibraryImportSchema,
					},
				},
				required: true,
			},
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(LibraryImportReportSchema, EmptyMetaSchema), "What was added."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
			422: problem("The body is invalid, or the AniList user is unknown or private."),
			503: problem("AniList could not be reached."),
		},
		security: signedIn,
		summary: "Import a watchlist and history",
		tags: ["Profiles"],
	}),

	listContinueWatching: createRoute({
		description:
			"The titles the profile is in the middle of, the most recently played first, each with the episode to play next. A title is judged by the episode played last: while it is unfinished it is the one to play, and once it is finished the episode after it is. A title with no episode after it is left out until one comes out; finishing it never leads on into another title, such as its next season. Only the 30 most recently played titles are looked at.",
		method: "get",
		operationId: "listContinueWatching",
		path: "/profiles/{profile_id}/continue-watching",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(z.array(ContinueWatchingSchema), CountMetaSchema), "The titles."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Titles the profile is in the middle of",
		tags: ["Profiles"],
	}),

	listDevices: createRoute({
		description:
			"The devices the account is signed in on, the one used most recently first. A device is a sign-in: signing in again on the same browser adds another. `last_active_at` is kept up to a day behind.",
		method: "get",
		operationId: "listDevices",
		path: "/devices",
		responses: {
			200: json(envelopeOf(z.array(SignedInDeviceSchema), CountMetaSchema), "The devices."),
			401: problem("Not signed in."),
		},
		security: signedIn,
		summary: "List the devices the account is signed in on",
		tags: ["Account"],
	}),

	listEpisodes: createRoute({
		description:
			"Every episode when `limit` is omitted, so a title's page needs one request; otherwise `limit` episodes from `offset`, with `meta.next` linking to the ones after.",
		method: "get",
		operationId: "listEpisodes",
		path: "/series/{series_id}/episodes",
		request: {
			params: SeriesParams,
			query: z.object({
				limit: z.coerce.number().int().min(1).max(500).optional().openapi({
					description: "At most this many episodes; all the rest when omitted.",
				}),
				offset: z.coerce.number().int().min(0).optional().openapi({
					description: "How many episodes to skip; 0 when omitted.",
				}),
			}),
		},
		responses: {
			200: json(
				envelopeOf(
					z.array(EpisodeSchema),
					OffsetMetaSchema.extend({
						series_id: z.string(),
					}),
				),
				"The title's episodes, numbered from 1.",
			),
			404: problem("No such title."),
		},
		summary: "List a series' episodes",
		tags: ["Series"],
	}),

	listGenres: createRoute({
		method: "get",
		operationId: "listGenres",
		path: "/genres",
		responses: {
			200: json(
				envelopeOf(z.array(z.string()), CountMetaSchema),
				"Genre names accepted by `browseSeries`.",
			),
		},
		summary: "List genres",
		tags: ["Series"],
	}),

	listImages: createRoute({
		description:
			"Every backdrop, poster, and logo TMDB has for the title, in every language, and for a show each season's posters too. Choose one with `updateArtwork`. Titles TMDB does not list have none. They are fetched from TMDB the first time and kept; `refreshImages` fetches them again.",
		method: "get",
		operationId: "listImages",
		path: "/series/{series_id}/images",
		request: {
			params: z.object({
				series_id: SeriesIdParam,
			}),
			query: z
				.object({
					language: commaSeparated(
						z
							.array(z.string().regex(/^(?:[a-z]{2}|none)$/u))
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
					type: commaSeparated(z.array(ImageTypeSchema), "backdrop,poster").openapi({
						description: "Only these types; every type when omitted.",
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
		summary: "List a series' images",
		tags: ["Series"],
	}),

	listProfiles: createRoute({
		description:
			"Every profile of the signed-in account, oldest first. A new account starts with one.",
		method: "get",
		operationId: "listProfiles",
		path: "/profiles",
		responses: {
			200: json(envelopeOf(z.array(ProfileSchema), CountMetaSchema), "The profiles."),
			401: problem("Not signed in."),
		},
		security: signedIn,
		summary: "List the account's profiles",
		tags: ["Profiles"],
	}),

	listRecommendations: createRoute({
		description:
			"Rows of titles for the profile's home page, each with a heading that says why it is there: `Because you watched` one of its recent titles, more of its favourite genres, and for any profile the best liked titles and films. Never a title the profile played or listed, in any status, nor another season of one, and a title appears in one row only. A row has at least 8 titles, so a profile with little history gets fewer rows rather than short ones.",
		method: "get",
		operationId: "listRecommendations",
		path: "/profiles/{profile_id}/recommendations",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(z.array(RecommendationRowSchema), CountMetaSchema), "The rows."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Rows of titles recommended to the profile",
		tags: ["Profiles"],
	}),

	listReleases: createRoute({
		description:
			"The titles with an episode out in the last 30 days, each with its latest episode that can be watched, the latest first. A new episode of a show counts, not only a new title; an episode that has aired but cannot be played yet is left out until it can. `format` and `audio` apply to the title.",
		method: "get",
		operationId: "listReleases",
		path: "/releases",
		request: {
			query: z
				.object({
					audio: browse.audio,
					format: commaSeparated(browse.format.unwrap(), "TV,MOVIE"),
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
		summary: "Newly added episodes",
		tags: ["Series"],
	}),

	listSeasons: createRoute({
		description:
			"Every season some anime started in, the latest first, up to next season, whose titles are announced by now. Pass one to `browseSeries` as `season` and `season_year`.",
		method: "get",
		operationId: "listSeasons",
		path: "/seasons",
		responses: {
			200: json(
				envelopeOf(
					z.array(AnimeSeasonSchema),
					CountMetaSchema.extend({
						current: AnimeSeasonSchema.meta({
							description: "The season airing now.",
						}),
					}),
				),
				"The seasons, and the one airing now.",
			),
		},
		summary: "List anime seasons",
		tags: ["Series"],
	}),

	listUpcoming: createRoute({
		description:
			"Titles starting within 30 days from today, on a day that is known, whatever they are: a season, a film, or an OVA. What is only announced, or dated to a month or year, is never listed. `returning` titles come first, then new titles, each kind the most anticipated first and at most 12. A title is returning when its franchise has something out already; the earliest title of the franchise that is out is listed in its place, since that is where catching up starts.",
		method: "get",
		operationId: "listUpcoming",
		path: "/upcoming",
		responses: {
			200: json(envelopeOf(z.array(UpcomingSeriesSchema), CountMetaSchema), "The titles."),
		},
		summary: "Titles with something starting soon",
		tags: ["Series"],
	}),

	listWatchlist: createRoute({
		description:
			"Every title on the profile's watchlist with its status, the one whose status changed last first.",
		method: "get",
		operationId: "listWatchlist",
		path: "/profiles/{profile_id}/watchlist",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(z.array(WatchlistEntrySchema), CountMetaSchema), "The watchlist."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "The profile's watchlist",
		tags: ["Profiles"],
	}),

	listWatchlistStatuses: createRoute({
		description:
			"The ID and status of every title on the profile's watchlist, without the titles' cards. For knowing what is listed; `listWatchlist` has the cards.",
		method: "get",
		operationId: "listWatchlistStatuses",
		path: "/profiles/{profile_id}/watchlist/statuses",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(z.array(WatchlistStatusEntrySchema), CountMetaSchema), "The statuses."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "The status of every title on the profile's watchlist",
		tags: ["Profiles"],
	}),

	markEpisodeUnwatched: createRoute({
		description:
			"Forgets the profile's progress in the episode, so it is neither watched nor started: in the rewatch the profile is in the middle of, if any, else in its first viewing.",
		method: "delete",
		operationId: "markEpisodeUnwatched",
		path: "/profiles/{profile_id}/series/{series_id}/episodes/{episode}/watched",
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
		security: signedIn,
		summary: "Mark an episode unwatched",
		tags: ["Profiles"],
	}),

	markEpisodeWatched: createRoute({
		description:
			"Marks the episode watched without playing it, as if it had been played to its end just now, in the rewatch the profile is in the middle of, if any. The watchlist status moves on as finishing it would.",
		method: "put",
		operationId: "markEpisodeWatched",
		path: "/profiles/{profile_id}/series/{series_id}/episodes/{episode}/watched",
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
		security: signedIn,
		summary: "Mark an episode watched",
		tags: ["Profiles"],
	}),

	markNotificationsRead: createRoute({
		description:
			"Marks the given notifications read. One that is not listed, or already read, is left as it is.",
		method: "put",
		operationId: "markNotificationsRead",
		path: "/profiles/{profile_id}/notifications/read",
		request: {
			body: {
				content: {
					"application/json": {
						schema: NotificationsReadSchema,
					},
				},
				required: true,
			},
			params: ProfileParams,
		},
		responses: {
			204: {
				description: "Marked.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
			422: problem("The body is invalid."),
		},
		security: signedIn,
		summary: "Mark notifications read",
		tags: ["Profiles"],
	}),

	markSeriesWatched: createRoute({
		description:
			"Marks every episode the title lists watched without playing them, as if each had been played to its end just now. The watchlist status moves on as finishing them would. During a rewatch it ends the rewatch instead: its progress is forgotten, and only episodes the first viewing left unfinished are marked, so the rest keep when they were watched. `removeProgress` marks the title unwatched.",
		method: "put",
		operationId: "markSeriesWatched",
		path: "/profiles/{profile_id}/series/{series_id}/watched",
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
		security: signedIn,
		summary: "Mark a title watched",
		tags: ["Profiles"],
	}),

	refreshImages: createRoute({
		description:
			"Fetches the title's images from TMDB again, past every cache, and keeps them in place of the old, so artwork added on TMDB since can be chosen. When TMDB fails, the kept images stay as they were.",
		method: "post",
		operationId: "refreshImages",
		path: "/series/{series_id}/images/refresh",
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
		summary: "Refresh a series' images",
		tags: ["Series"],
	}),

	removeFromWatchlist: createRoute({
		description: "Takes the title off the profile's watchlist. The profile's progress in it stays.",
		method: "delete",
		operationId: "removeFromWatchlist",
		path: "/profiles/{profile_id}/watchlist/{series_id}",
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
		security: signedIn,
		summary: "Take a title off the watchlist",
		tags: ["Profiles"],
	}),

	removeProgress: createRoute({
		description:
			"Forgets the profile's progress in every episode of the title, in its first viewing and any rewatch, which takes it out of `listContinueWatching`.",
		method: "delete",
		operationId: "removeProgress",
		path: "/profiles/{profile_id}/series/{series_id}/progress",
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
		security: signedIn,
		summary: "Forget the profile's progress in a title",
		tags: ["Profiles"],
	}),

	saveProgress: createRoute({
		description:
			"Replaces what was remembered for the episode. A player sends it every few seconds while the episode plays, and when it is paused, left, or ends, and says each time whether the episode is over at that point. Stopping at second 0 of an unfinished episode is not remembered, since opening an episode is not watching it, and a finished episode stays as it was unless it is finished again. During a rewatch (see `startRewatch`) this is the rewatch's progress.",
		method: "put",
		operationId: "saveProgress",
		path: "/profiles/{profile_id}/series/{series_id}/episodes/{episode}/progress",
		request: {
			body: {
				content: {
					"application/json": {
						schema: ProgressInputSchema,
					},
				},
				required: true,
			},
			params: ProfileEpisodeParams,
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
		security: signedIn,
		summary: "Remember where the profile stopped in an episode",
		tags: ["Profiles"],
	}),

	searchSeries: createRoute({
		description:
			"Finds titles matching `q` in English, romaji, Japanese, or a known synonym or abbreviation, forgiving typos. Best match first, weighing how popular titles are, unless `sort` is given; narrowed by the same filters as `browseSeries`. One card per title, and a first search for a title not prepared yet may come back without it while it is prepared in the background.",
		method: "get",
		operationId: "searchSeries",
		path: "/search",
		request: {
			query: SearchParams,
		},
		responses: {
			200: json(SeriesPageSchema, "A page of titles."),
			422: problem("The query is invalid or `q` is missing."),
			503: problem("The catalog upstream is unavailable; retry after `Retry-After`."),
		},
		summary: "Search series",
		tags: ["Series"],
	}),

	setWatchlistStatus: createRoute({
		description:
			"Puts the title on the profile's watchlist with the status given, or changes the status of one already there.",
		method: "put",
		operationId: "setWatchlistStatus",
		path: "/profiles/{profile_id}/watchlist/{series_id}",
		request: {
			body: {
				content: {
					"application/json": {
						schema: z.object({
							status: WatchlistStatusSchema,
						}),
					},
				},
				required: true,
			},
			params: ProfileParams.extend({
				series_id: SeriesIdParam,
			}),
		},
		responses: {
			204: {
				description: "Set.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile, or the series does not exist."),
			422: problem("The body is invalid."),
		},
		security: signedIn,
		summary: "Put a title on the watchlist with a status",
		tags: ["Profiles"],
	}),

	signOutDevice: createRoute({
		description:
			"Ends the sign-in of one device, which has to sign in again. Signing out the device the request came from is the same as signing out. An ID that is not the account's, or is already gone, does nothing.",
		method: "delete",
		operationId: "signOutDevice",
		path: "/devices/{device_id}",
		request: {
			params: z.object({
				device_id: z.string().meta({
					description: "A device's `id`, from `listDevices`.",
				}),
			}),
		},
		responses: {
			204: {
				description: "Signed out, or was not signed in.",
			},
			401: problem("Not signed in."),
		},
		security: signedIn,
		summary: "Sign a device out",
		tags: ["Account"],
	}),

	signOutOtherDevices: createRoute({
		description:
			"Ends every sign-in of the account but the one the request came from, as after losing a phone.",
		method: "delete",
		operationId: "signOutOtherDevices",
		path: "/devices",
		responses: {
			204: {
				description: "Every other device is signed out.",
			},
			401: problem("Not signed in."),
		},
		security: signedIn,
		summary: "Sign every other device out",
		tags: ["Account"],
	}),

	startRewatch: createRoute({
		description:
			"Starts watching the title again from its first episode. Until the profile finishes its last episode again, or marks the title watched, what it plays is remembered apart from its first viewing, which stays as it was, and the progress and episode to play next in `getSeriesProgress` follow it (see `rewatch_started_at`).",
		method: "post",
		operationId: "startRewatch",
		path: "/profiles/{profile_id}/series/{series_id}/rewatch",
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
		security: signedIn,
		summary: "Watch a title again from the start",
		tags: ["Profiles"],
	}),

	updateArtwork: createRoute({
		description:
			"Chooses the title's poster, backdrop, or logo, and where and how large the logo is drawn, for everyone. An HTTPS URL replaces the image, `false` shows none, `null` goes back to the one Sora chose, and an omitted field stays as it is. The choice is kept when the title is laid out again.",
		method: "patch",
		operationId: "updateArtwork",
		path: "/series/{series_id}/artwork",
		request: {
			body: {
				content: {
					"application/json": {
						schema: ArtworkChangesSchema,
					},
				},
				required: true,
			},
			params: z.object({
				series_id: SeriesIdParam,
			}),
		},
		responses: {
			200: json(envelopeOf(SeriesSchema, EmptyMetaSchema), "The title, with its new artwork."),
			404: problem("No such title."),
			422: problem("The body is invalid."),
		},
		summary: "Change a series' artwork",
		tags: ["Series"],
	}),

	updatePlaybackPreferences: createRoute({
		description:
			"Changes only what is given. Subtitles change per audio: picking the dub's leaves the sub's as they are.",
		method: "patch",
		operationId: "updatePlaybackPreferences",
		path: "/profiles/{profile_id}/playback-preferences",
		request: {
			body: {
				content: {
					"application/json": {
						schema: PlaybackPreferencesUpdateSchema,
					},
				},
				required: true,
			},
			params: ProfileParams,
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
		security: signedIn,
		summary: "Remember what the profile picked in a player",
		tags: ["Profiles"],
	}),

	updateProfile: createRoute({
		method: "patch",
		operationId: "updateProfile",
		path: "/profiles/{profile_id}",
		request: {
			body: {
				content: {
					"application/json": {
						schema: ProfileInputSchema.partial(),
					},
				},
				required: true,
			},
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(ProfileSchema, EmptyMetaSchema), "The profile."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
			422: problem("The body is invalid."),
		},
		security: signedIn,
		summary: "Rename or recolor a profile",
		tags: ["Profiles"],
	}),

	updateProfilePreferences: createRoute({
		description:
			"Changes only what is given. Notification kinds change one by one: turning off dubs leaves the other kinds as they are.",
		method: "patch",
		operationId: "updateProfilePreferences",
		path: "/profiles/{profile_id}/preferences",
		request: {
			body: {
				content: {
					"application/json": {
						schema: ProfilePreferencesUpdateSchema,
					},
				},
				required: true,
			},
			params: ProfileParams,
		},
		responses: {
			200: json(
				envelopeOf(ProfilePreferencesSchema, EmptyMetaSchema),
				"The preferences as they now stand.",
			),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
			422: problem("The body is invalid."),
		},
		security: signedIn,
		summary: "Change the profile's display and notification preferences",
		tags: ["Profiles"],
	}),

	upscaleBackdrop: createRoute({
		description:
			"Asks for one of the title's backdrops to be restored with an AI upscaler, so it looks sharp instead of blurry: it is cleaned up at twice its size and kept at up to 4K wide. It takes minutes and is made in the background: poll `listImages` for `upscale` of the backdrop to become `done`. Then, when the original is still the title's chosen backdrop, the upscaled one is chosen in its place. Asking again for a backdrop that is queued or done changes nothing; for one that failed, tries again.",
		method: "post",
		operationId: "upscaleBackdrop",
		path: "/series/{series_id}/images/upscale",
		request: {
			body: {
				content: {
					"application/json": {
						schema: UpscaleBackdropSchema,
					},
				},
				required: true,
			},
			params: z.object({
				series_id: SeriesIdParam,
			}),
		},
		responses: {
			200: json(envelopeOf(z.array(SeriesImageSchema), CountMetaSchema), "The images, best first."),
			404: problem("No such title."),
			422: problem("The URL is not one of the title's backdrops."),
		},
		summary: "Upscale a backdrop",
		tags: ["Series"],
	}),
};
