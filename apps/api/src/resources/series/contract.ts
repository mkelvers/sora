import { createRoute, z } from "@hono/zod-openapi";
import { BrowseQuerySchema } from "@sora/core/catalog/browse-query";
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
	UpcomingSeriesSchema,
	UpscaleBackdropSchema,
} from "@sora/core/models/series";

import {
	CountMetaSchema,
	envelopeOf,
	OffsetMetaSchema,
	PageMetaSchema,
} from "../../openapi/envelope";
import {
	json,
	problem,
	SeriesIdParam,
	SeriesParams,
	EmptyMetaSchema,
	EpisodeParams,
} from "../../openapi/schemas";

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

/** A page of title cards. */
const SeriesPageSchema = envelopeOf(z.array(SeriesCardSchema), PageMetaSchema);

/** Titles and the catalog: browsing, searching, a title's page, images, episodes, and the schedule. */
export const seriesRoute = {
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
