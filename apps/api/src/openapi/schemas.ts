/**
 * The request parameters and response bodies of the `/v1` contracts, with
 * every field in snake_case. Every response schema is checked with
 * `satisfies` against the core's type in snake_case (see `SnakeCased`), so
 * the OpenAPI document cannot drift from what the handlers return.
 */
import { z } from "@hono/zod-openapi";
import type { Profile, ProfileAvatar } from "@sora/core/auth";
import type { AnimeSeason, AnimeTag } from "@sora/core/catalog";
import type {
	ContinueWatching,
	NextEpisode,
	Notification,
	PlaybackPreferences,
	Progress,
	SeriesProgress,
	SubtitleChoice,
	WatchlistEntry,
	WatchlistStatus,
} from "@sora/core/library";
import type { PlaybackMedia, SkipSegment } from "@sora/core/playback";
import type {
	Episode,
	Release,
	ScheduledEpisode,
	Series,
	SeriesCard,
	SeriesImage,
	UpcomingSeries,
} from "@sora/core/series";

import type { SnakeCased } from "./envelope";

/**
 * An RFC 9457 problem details body, which every error response carries as
 * `application/problem+json`.
 */
const ProblemSchema = z
	.object({
		type: z.string().openapi({
			example: "about:blank",
		}),
		title: z.string().openapi({
			example: "Not Found",
		}),
		status: z.number().int().openapi({
			example: 404,
		}),
		detail: z.string().optional().openapi({
			example: "Series GYZJ43JMR does not exist",
		}),
		instance: z.string().optional().openapi({
			example: "/v1/series/GYZJ43JMR",
		}),
		code: z.string().openapi({
			description:
				"A stable, machine-readable failure code to branch on; `detail` may change. New codes may be added, so clients must handle codes they do not know.",
			example: "SERIES_NOT_FOUND",
		}),
		/** Every invalid field, for `INVALID_INPUT` problems. */
		errors: z
			.array(
				z.object({
					path: z.string(),
					message: z.string(),
				}),
			)
			.optional(),
	})
	.openapi("Problem");

/** The body of every error response. */
export type Problem = z.infer<typeof ProblemSchema>;

/** A problem response for the given status, for route definitions. */
export function problem(description: string) {
	return {
		description,
		content: {
			"application/problem+json": {
				schema: ProblemSchema,
			},
		},
	};
}

/** A JSON response for the given schema, for route definitions. */
export function json<TSchema extends z.ZodType>(schema: TSchema, description: string) {
	return {
		description,
		content: {
			"application/json": {
				schema,
			},
		},
	};
}

export const SeriesIdParam = z.string().openapi({
	param: {
		name: "series_id",
		in: "path",
	},
	description: "Sora series ID.",
	example: "GYZJ43JMR",
});

export const ProfileIdParam = z.string().openapi({
	param: {
		name: "profile_id",
		in: "path",
	},
	description: "Sora profile ID, of a profile of the signed-in account.",
	example: "7HTQ2LMXB",
});

export const EpisodeNumberParam = z.coerce
	.number()
	.int()
	.positive()
	.openapi({
		param: {
			name: "episode",
			in: "path",
		},
		description: "The episode's number in the series, from 1.",
		example: 1,
	});

const StatusSchema = z.enum(["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"]);

/** Dubbed audio, the original audio with subtitles (sub), or the original audio alone (raw). */
const LanguageSchema = z.enum(["dub", "sub", "raw"]);

const FormatSchema = z.enum(["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"]);

export const SeriesCardSchema = z
	.object({
		id: z.string().openapi({
			example: "GYZJ43JMR",
		}),
		kind: z.enum(["tv", "movie", "standalone"]).openapi({
			description:
				"How TMDB lists the entry: in a show (`tv`), as a film (`movie`), or not at all (`standalone`).",
		}),
		format: FormatSchema.nullable().openapi({
			description: "What AniList lists the entry as, such as a TV season, a film, or an OVA.",
		}),
		title: z.string().openapi({
			description: "AniList's title of the entry, which names its season.",
			example: "That Time I Got Reincarnated as a Slime Season 2",
		}),
		poster_url: z.string().nullable().openapi({
			description: "AniList's cover of the entry.",
		}),
		backdrop_url: z.string().nullable().openapi({
			description:
				"TMDB's backdrop of the show or film, which the seasons of a show share, or AniList's banner when TMDB has none.",
		}),
		logo_url: z.string().nullable(),
		logo_scale: z.number().openapi({
			description: "How large to draw the logo, relative to its usual size: 1 is as usual.",
			example: 1,
		}),
		logo_offset_x: z.number().openapi({
			description:
				"How far right to move the logo from its usual place on the series page, in widths of its hero.",
			example: 0,
		}),
		logo_offset_y: z.number().openapi({
			description:
				"How far down to move the logo from its usual place on the series page, in widths of its hero.",
			example: 0,
		}),
		year: z.number().int().nullable().openapi({
			example: 2021,
		}),
		status: StatusSchema.nullable(),
		audio: z.array(LanguageSchema).openapi({
			description:
				"The audio any of its episodes can be watched with, dub before sub before raw. Empty when nothing streams it, or while Sora has not looked it up on providers yet.",
		}),
		overview: z.string().nullable(),
		score: z.number().nullable().openapi({
			description: "AniList's weighted score, 0–100.",
		}),
		genres: z.array(z.string()).openapi({
			description: "AniList's genres.",
		}),
		episode_count: z.number().int().openapi({
			description: "How many episodes it lists, as `listEpisodes` lists them.",
		}),
	})
	.openapi("SeriesCard") satisfies z.ZodType<SnakeCased<SeriesCard>>;

const TagSchema = z.object({
	name: z.string(),
	rank: z.number().nullable(),
	spoiler: z.boolean(),
}) satisfies z.ZodType<SnakeCased<AnimeTag>>;

export const SeriesSchema = SeriesCardSchema.extend({
	start_date: z.string().nullable().openapi({
		description:
			"First release: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, as precise as AniList knows it.",
		example: "2018-10-02",
	}),
	tags: z.array(TagSchema),
	studios: z.array(z.string()),
	score_count: z.number().int().nullable().openapi({
		description:
			"How many AniList users have scored it, behind `score`. Null until Sora's search index has it.",
		example: 610640,
	}),
	next_episode: z
		.object({
			number: z.number().int(),
			airing_at: z.string(),
		})
		.nullable()
		.openapi({
			description: "The next episode to air, or null when none is announced.",
		}),
	backdrop_edges: z
		.object({
			left: z.string().openapi({
				example: "#1b2330",
			}),
			right: z.string().openapi({
				example: "#0d1118",
			}),
		})
		.nullable()
		.openapi({
			description:
				"The backdrop's average colour down its left and right edges, as `#rrggbb`, to fill the space beside it when it is shown whole. Null without a backdrop, or until Sora has measured it.",
		}),
	franchise: z
		.array(
			z.object({
				series_id: z.string(),
				title: z.string().openapi({
					description:
						"The title without the franchise's name, such as `Season 2`, `OAD`, or `Tears of the Azure Sea`; the first season is `Season 1`. A title not named after the franchise keeps its whole title.",
					example: "Season 2",
				}),
				format: FormatSchema.nullable(),
				episode_count: z.number().int().openapi({
					description: "How many of its episodes can be watched.",
				}),
			}),
		)
		.openapi({
			description:
				"Every title of its franchise that is out, this one included, as AniList relates them: its seasons in release order, then its films, OVAs, and spin-offs. Just this one when it has no other.",
		}),
}).openapi("Series") satisfies z.ZodType<SnakeCased<Series>>;

export const ImageTypeSchema = z.enum(["poster", "backdrop", "logo"]);

export const SeriesImageSchema = z
	.object({
		type: ImageTypeSchema,
		url: z.string().openapi({
			description:
				"The original size. Swap `/original/` for a TMDB size bucket, such as `/w780/`, for a smaller file.",
			example: "https://image.tmdb.org/t/p/original/rBOnrVlck7BIlGeWVlzYiZeg4l2.jpg",
		}),
		width: z.number().int().openapi({
			example: 3840,
		}),
		height: z.number().int().openapi({
			example: 2160,
		}),
		language: z.string().nullable().openapi({
			description: "ISO 639-1 code of any text on the image; null when it has none.",
			example: "en",
		}),
		vote_average: z.number(),
		vote_count: z.number().int(),
		season_number: z.number().int().nullable().openapi({
			description: "TMDB's number of the season a poster is for; null for the title's own.",
		}),
	})
	.openapi("SeriesImage") satisfies z.ZodType<SnakeCased<SeriesImage>>;

export const UpcomingSeriesSchema = z
	.object({
		series: SeriesCardSchema,
		start_date: z.string().openapi({
			description: "When it starts, as `YYYY-MM-DD`.",
			example: "2026-10-03",
		}),
		returning: z.boolean().openapi({
			description:
				"Whether what starts belongs to a franchise with something out already, such as a new season of a show, rather than being a new title. `series` is then the earliest title of the franchise that is out, the one to start catching up on.",
		}),
	})
	.openapi("UpcomingSeries") satisfies z.ZodType<SnakeCased<UpcomingSeries>>;

export const EpisodeSchema = z
	.object({
		number: z.number().int(),
		title: z.string().nullable(),
		overview: z.string().nullable(),
		air_date: z.string().nullable().openapi({
			description: "YYYY-MM-DD, in the calendar of the country the episode aired in.",
			example: "2018-10-02",
		}),
		aired_at: z.string().nullable().openapi({
			description:
				"ISO 8601 timestamp of the broadcast, to show in the viewer's time zone. Null when it is not known, as for most older anime; air_date is then the only date known.",
			example: "2018-10-02T15:00:00.000Z",
		}),
		runtime_minutes: z.number().int().nullable(),
		still_url: z.string().nullable(),
		audio: z.array(LanguageSchema).nullable().openapi({
			description:
				"The audio the episode can be watched with, dub before sub before raw: dubbed, the original with subtitles, or the original alone. Empty when nothing streams it, and null only when Sora could not look it up on providers yet: list the episodes again shortly.",
		}),
		filler: z.boolean().openapi({
			description:
				"Whether the episode is filler: story the manga does not have. False when no provider says it is.",
		}),
	})
	.openapi("Episode") satisfies z.ZodType<SnakeCased<Episode>>;

export const ScheduledEpisodeSchema = z
	.object({
		series: SeriesCardSchema,
		episode: z.number().int().openapi({
			description: "The episode's number in the series, from 1.",
		}),
		air_type: z.enum(["sub", "dub"]).openapi({
			description:
				"Whether it comes out with English subtitles (`sub`) or dubbed in English (`dub`).",
		}),
		airing_at: z.string(),
	})
	.openapi("ScheduledEpisode") satisfies z.ZodType<SnakeCased<ScheduledEpisode>>;

export const AnimeSeasonSchema = z
	.object({
		season: z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]),
		year: z.number().int().openapi({
			example: 2026,
		}),
	})
	.openapi("AnimeSeason") satisfies z.ZodType<SnakeCased<AnimeSeason>>;

export const ReleaseSchema = z
	.object({
		series: SeriesCardSchema,
		episode: z.number().int().openapi({
			description: "The episode's number in the series, from 1.",
		}),
		released_at: z.string().openapi({
			description:
				"When the episode came out: when it aired, or its air date's midnight UTC when AniList has no airing time.",
			example: "2026-09-27T15:00:00.000Z",
		}),
	})
	.openapi("Release") satisfies z.ZodType<SnakeCased<Release>>;

const LocaleSchema = z.string().min(1).openapi({
	description: "BCP 47 language tag.",
	example: "en",
});

export const SkipSegmentSchema = z
	.object({
		kind: z.enum(["opening", "ending"]),
		start: z.number().nonnegative().openapi({
			description: "Seconds from the start of the stream.",
		}),
		end: z.number().positive().openapi({
			description: "Seconds from the start of the stream; always after `start`.",
		}),
	})
	.openapi("SkipSegment") satisfies z.ZodType<SnakeCased<SkipSegment>>;

export const PlaybackMediaSchema = z
	.object({
		audio: LanguageSchema,
		label: z.string().openapi({
			description: "The audio's name, for an audio menu.",
			example: "Dub",
		}),
		locale: LocaleSchema.nullable().openapi({
			description:
				"Language of the dub's audio or of the sub's default subtitles: always `en`, since Sora serves English. Null for raw, which keeps the original audio and has no subtitles.",
		}),
		provider: z.string().openapi({
			description: "The provider that serves this version.",
		}),
		hardsub: z.boolean().openapi({
			description:
				"Whether the English subtitles are burned into the picture rather than served as a track, so they cannot be styled or turned off; `subtitles` then holds other languages only, if any. A sub with an English track is served when any provider has one. Always false for dub and raw.",
		}),
		sources: z
			.array(
				z.object({
					url: z.url().openapi({
						description:
							"The stream through Sora's proxy; hand it to the player as is. Expires with the playback.",
					}),
					format: z.enum(["hls", "mp4"]),
					quality: z.enum(["auto", "1080p", "720p", "480p", "360p"]),
				}),
			)
			.openapi({
				description: "Ordered best first.",
			}),
		subtitles: z.array(
			z.object({
				url: z.url().openapi({
					description:
						"The subtitle file through Sora's proxy; hand it to the player as is. Expires with the playback.",
				}),
				language: z.string().openapi({
					description: "BCP 47 language tag.",
					example: "en",
				}),
				label: z.string().openapi({
					description: "The language's English name, for a subtitle menu.",
					example: "Brazilian Portuguese",
				}),
				format: z.enum(["vtt", "srt", "ass"]).nullable(),
				kind: z.enum(["dialogue", "signs", "captions"]).nullable().openapi({
					description:
						"What the track carries, worked out from its name and its cues: `dialogue` is what the characters say, `signs` is text shown on screen and forced subtitles, and `captions` is dialogue with descriptions of sound. Null when that is not clear, in which case a menu should show the track as plain subtitles.",
				}),
				default: z.boolean().openapi({
					description:
						"Whether a player shows this track from the start: the English dialogue track, for a sub and a dub alike. None for raw or a hardsub, which has no English track.",
				}),
			}),
		),
		skip_segments: z.array(SkipSegmentSchema).openapi({
			description:
				"Opening and ending, in playback order, as the provider's player ships them. Timed against these sources: a dub can be cut differently from its sub. Empty when the provider reports none.",
		}),
	})
	.openapi("PlaybackMedia") satisfies z.ZodType<SnakeCased<PlaybackMedia>>;

/** The episode a playback is for, when its stream URLs expire, and the episodes either side of it. */
export const PlaybackMetaSchema = z
	.object({
		series_id: z.string(),
		episode: z.number().int(),
		expires_at: z.string().openapi({
			description:
				"When the stream URLs stop working, as an ISO 8601 timestamp. Resolve again after it.",
			example: "2026-09-25T18:00:00.000Z",
		}),
		next: z.string().nullable().openapi({
			description:
				"The next episode's playback URL, or null after the last one the title lists: playing never runs on into another title, such as the next season.",
			example: "/v1/series/GYZJ43JMR/episodes/2/playback",
		}),
		previous: z.string().nullable().openapi({
			description: "The previous episode's playback URL, or null before the first one.",
		}),
	})
	.openapi("PlaybackMeta");

export const ProfileAvatarSchema = z
	.object({
		style: z.enum(["sprouts", "critters"]).openapi({
			description: "The animated DiceBear style the avatar is drawn in.",
		}),
		seed: z.string().trim().min(1).max(64).openapi({
			description: "The DiceBear seed: the same style and seed always draw the same avatar.",
			example: "7HTQ2LMXB",
		}),
	})
	.openapi("ProfileAvatar") satisfies z.ZodType<SnakeCased<ProfileAvatar>>;

export const ProfileSchema = z
	.object({
		id: z.string().openapi({
			example: "7HTQ2LMXB",
		}),
		name: z.string().openapi({
			example: "Maja",
		}),
		color: z.string().openapi({
			description: "A CSS color for the profile's tile.",
			example: "#4f7cff",
		}),
		avatar: ProfileAvatarSchema,
		created_at: z.string(),
	})
	.openapi("Profile") satisfies z.ZodType<SnakeCased<Profile>>;

export const ProfileInputSchema = z
	.object({
		name: z.string().trim().min(1).max(40),
		color: z
			.string()
			.regex(/^#[0-9a-f]{6}$/i)
			.optional()
			.openapi({
				description: "A hex color such as `#4f7cff`; picked from a palette when omitted.",
			}),
		avatar: ProfileAvatarSchema.optional().openapi({
			description: "A sprout seeded with the profile's ID when omitted.",
		}),
	})
	.openapi("ProfileInput", {
		example: {
			name: "Maja",
		},
	});

const SubtitleChoiceSchema = z
	.object({
		language: z.string().min(1).max(35).openapi({
			description: "BCP 47 language tag of the track.",
			example: "en",
		}),
		kind: z.enum(["dialogue", "signs", "captions"]).nullable().openapi({
			description: "What the track carries; `null` when that is not clear.",
		}),
	})
	.openapi("SubtitleChoice", {
		description:
			"A subtitle track to pick again: the first with this language and kind, else the first with this language.",
	}) satisfies z.ZodType<SnakeCased<SubtitleChoice>>;

const SubtitlePreferencesSchema = z
	.object({
		sub: SubtitleChoiceSchema.nullable().optional(),
		dub: SubtitleChoiceSchema.nullable().optional(),
	})
	.openapi("SubtitlePreferences", {
		description:
			"The subtitles picked for a sub and for a dub: a track to pick again, or `null` for none. An audio left out shows its default track.",
	});

export const PlaybackPreferencesSchema = z
	.object({
		audio: z.enum(["sub", "dub", "raw"]).nullable().openapi({
			description: "The version to play when an episode has it; `null` for the first it has.",
		}),
		subtitles: SubtitlePreferencesSchema,
		auto_skip: z.boolean().openapi({
			description: "Whether openings and endings are skipped without asking.",
		}),
	})
	.openapi("PlaybackPreferences") satisfies z.ZodType<SnakeCased<PlaybackPreferences>>;

export const PlaybackPreferencesUpdateSchema = z
	.object({
		audio: z.enum(["sub", "dub", "raw"]).nullable().optional(),
		subtitles: SubtitlePreferencesSchema.optional().openapi({
			description: "Changes the subtitles of the audio given, leaving the other's as they are.",
		}),
		auto_skip: z.boolean().optional(),
	})
	.openapi("PlaybackPreferencesUpdate", {
		example: {
			subtitles: {
				dub: null,
			},
		},
	});

export const ProgressSchema = z
	.object({
		series_id: z.string(),
		episode: z.number().int().openapi({
			description: "The episode's number in the series, from 1.",
		}),
		position_seconds: z.number().int().openapi({
			description: "Where the profile stopped, in seconds from the start.",
			example: 754,
		}),
		duration_seconds: z.number().int().openapi({
			description: "How long the episode runs, in seconds.",
			example: 1420,
		}),
		finished: z.boolean().openapi({
			description:
				"Whether the profile stopped where the episode is over, as the player it watched in judged: it played to the end, or stopped in or after its ending. Playing part of a finished episode again leaves it finished. Play a finished episode from the start.",
		}),
		watched_at: z.string().openapi({
			description: "When the profile last played the episode, as an ISO 8601 timestamp.",
			example: "2026-10-01T18:00:00.000Z",
		}),
	})
	.openapi("Progress") satisfies z.ZodType<SnakeCased<Progress>>;

export const ProgressInputSchema = z
	.object({
		position_seconds: z.number().int().nonnegative(),
		duration_seconds: z.number().int().positive(),
		finished: z.boolean().openapi({
			description:
				"Whether the episode is over where the profile stopped: it played to the end, or only its credits are left. The player judges, since it knows where the credits are.",
		}),
	})
	.openapi("ProgressInput", {
		example: {
			position_seconds: 754,
			duration_seconds: 1420,
			finished: false,
		},
	});

const nextEpisode = {
	episode: z.number().int().openapi({
		description: "The episode's number in the series, from 1.",
	}),
	position_seconds: z.number().int().openapi({
		description: "Where to resume the episode, in seconds; 0 for one not started.",
	}),
	duration_seconds: z.number().int().nullable().openapi({
		description: "How long the episode runs, in seconds; null for one not started.",
	}),
};

export const NextEpisodeSchema = z.object(nextEpisode).openapi("NextEpisode") satisfies z.ZodType<
	SnakeCased<NextEpisode>
>;

export const ContinueWatchingSchema = z
	.object({
		series: SeriesCardSchema,
		...nextEpisode,
	})
	.openapi("ContinueWatching") satisfies z.ZodType<SnakeCased<ContinueWatching>>;

export const WatchlistStatusSchema = z
	.enum(["watching", "plan_to_watch", "completed", "dropped"])
	.openapi("WatchlistStatus", {
		description:
			"Where the profile is with a title on its watchlist. The profile picks it, and playing an episode moves it on: finishing an episode of a listed title makes it `watching`, and finishing the finale of a title that has finished airing makes it `completed`, adding it when it was not listed. A `completed` title stays completed.",
	}) satisfies z.ZodType<WatchlistStatus>;

export const WatchlistEntrySchema = z
	.object({
		series: SeriesCardSchema,
		status: WatchlistStatusSchema,
		added_at: z.string().openapi({
			description: "When the title was put on the watchlist, as an ISO 8601 timestamp.",
			example: "2026-10-01T18:00:00.000Z",
		}),
		updated_at: z.string().openapi({
			description: "When its status last changed, as an ISO 8601 timestamp.",
			example: "2026-10-01T18:00:00.000Z",
		}),
	})
	.openapi("WatchlistEntry") satisfies z.ZodType<SnakeCased<WatchlistEntry>>;

export const SeriesProgressSchema = z
	.object({
		episodes: z.array(ProgressSchema).openapi({
			description:
				"The progress in every episode of the title the profile played, the most recently played first: in the rewatch it is in the middle of, if any, else in its first viewing.",
		}),
		next: NextEpisodeSchema.nullable().openapi({
			description:
				"The episode to play next, as `listContinueWatching` picks it; null when the profile played none of the title, or finished the last episode that is out.",
		}),
		rewatch_started_at: z.string().nullable().openapi({
			description:
				"When the profile started watching the title again from the start (see `startRewatch`), as an ISO 8601 timestamp; null when it is not.",
			example: "2026-10-03T18:00:00.000Z",
		}),
	})
	.openapi("SeriesProgress") satisfies z.ZodType<SnakeCased<SeriesProgress>>;

export const NotificationSchema = z
	.object({
		id: z.string().openapi({
			description: "Stable for as long as the notification is listed.",
			example: "EWBMBNIV4:13",
		}),
		kind: z.enum(["premiere", "episodes", "dub"]).openapi({
			description:
				"`premiere` when the title's first episode came out, which for a sequel of a title on the watchlist is the offer of a new season; `episodes` when a title that was out already gained episodes; `dub` when episodes that were out already were dubbed in English.",
		}),
		series: SeriesCardSchema,
		first_episode: z.number().int().openapi({
			description: "The first episode that came out, or was dubbed, from 1.",
		}),
		last_episode: z.number().int().openapi({
			description: "The last such episode; the same as `first_episode` when there was one.",
		}),
		episode_title: z.string().nullable().openapi({
			description: "The title of `last_episode`.",
		}),
		still_url: z.string().nullable().openapi({
			description: "A still of `last_episode`, or of the first episode for a premiere.",
		}),
		released_at: z.string().openapi({
			description: "When it came out, as an ISO 8601 timestamp.",
			example: "2026-10-04T13:30:00.000Z",
		}),
		unread: z.boolean().openapi({
			description: "Whether the profile has not marked it read.",
		}),
	})
	.openapi("Notification") satisfies z.ZodType<SnakeCased<Notification>>;

export const NotificationsMetaSchema = z
	.object({
		count: z.number().int().nonnegative(),
		unread: z.number().int().nonnegative().openapi({
			description:
				"How many of the profile's notifications are unread, including those past `limit`.",
		}),
	})
	.openapi("NotificationsMeta");

export const NotificationsReadSchema = z
	.object({
		ids: z
			.array(z.string().min(1))
			.min(1)
			.max(100)
			.openapi({
				description:
					"The `id` of each notification to mark read: the ones the profile was shown, so one that came out meanwhile stays unread.",
				example: ["EWBMBNIV4:13"],
			}),
	})
	.openapi("NotificationsRead");
