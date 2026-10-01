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
	Dropped,
	HistoryItem,
	NextEpisode,
	PlaybackPreferences,
	Progress,
	SeriesProgress,
	Show,
	SubtitleChoice,
} from "@sora/core/library";
import type { PlaybackMedia, SkipSegment } from "@sora/core/playback";
import type {
	Release,
	ScheduledEpisode,
	Season,
	SeasonEpisode,
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

export const SeasonIdParam = z.string().openapi({
	param: {
		name: "season_id",
		in: "path",
	},
	description: "Sora season ID.",
	example: "G6NQ5DWZ6",
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
		description: "Position within the season, from 1.",
		example: 1,
	});

const StatusSchema = z.enum(["FINISHED", "RELEASING", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"]);

/** Dubbed audio, the original audio with subtitles (sub), or the original audio alone (raw). */
const LanguageSchema = z.enum(["dub", "sub", "raw"]);

export const SeriesCardSchema = z
	.object({
		id: z.string().openapi({
			example: "GYZJ43JMR",
		}),
		kind: z.enum(["tv", "movie", "standalone"]),
		title: z.string().openapi({
			example: "That Time I Got Reincarnated as a Slime",
		}),
		poster_url: z.string().nullable(),
		backdrop_url: z.string().nullable(),
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
			example: 2018,
		}),
		status: StatusSchema.nullable(),
		audio: z.array(LanguageSchema).openapi({
			description:
				"The audio any of its episodes can be watched with, dub before sub before raw. Empty when nothing streams it, or while Sora has not looked it up on providers yet.",
		}),
		overview: z.string().nullable(),
		score: z.number().nullable().openapi({
			description: "AniList's weighted score of the first season, 0–100.",
		}),
		genres: z.array(z.string()).openapi({
			description: "AniList's genres of the first season.",
		}),
		season_count: z.number().int().openapi({
			description: "How many regular seasons it has, OVAs and films left out. A film has none.",
		}),
		episode_count: z.number().int().openapi({
			description: "How many episodes its regular seasons list.",
		}),
		start_season_id: z.string().nullable().openapi({
			description:
				"The season watching starts at: the first in watch order, or the first season when none is. Null for a title with no seasons laid out.",
		}),
	})
	.openapi("SeriesCard") satisfies z.ZodType<SnakeCased<SeriesCard>>;

const TagSchema = z.object({
	name: z.string(),
	rank: z.number().nullable(),
	spoiler: z.boolean(),
}) satisfies z.ZodType<SnakeCased<AnimeTag>>;

export const SeasonSchema = z
	.object({
		id: z.string().openapi({
			example: "G6NQ5DWZ6",
		}),
		kind: z.enum(["season", "ova", "movie"]),
		number: z.number().int(),
		title: z.string().openapi({
			example: "Season 1",
		}),
		in_watch_order: z.boolean().openapi({
			description:
				"Whether the season is part of the story in watch order: regular seasons and the films and OVAs between them. Extras, such as side-story OVAs and recaps, are not.",
		}),
		episode_count: z.number().int(),
	})
	.openapi("Season") satisfies z.ZodType<SnakeCased<Season>>;

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
			"How many AniList users have scored the first season, behind `score`. Null until Sora's search index has it.",
		example: 610640,
	}),
	next_episode: z
		.object({
			season_id: z.string(),
			number: z.number().int(),
			airing_at: z.string(),
		})
		.nullable(),
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
	seasons: z.array(SeasonSchema),
	related: z.array(SeriesCardSchema),
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
				"Whether the title already has something out, so what starts is a new season, film, or OVA of it, or of a title related to it, rather than a new title.",
		}),
	})
	.openapi("UpcomingSeries") satisfies z.ZodType<SnakeCased<UpcomingSeries>>;

export const SeasonEpisodeSchema = z
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
				"The audio the episode can be watched with, dub before sub before raw: dubbed, the original with subtitles, or the original alone. Empty when nothing streams it, and null only when Sora could not look it up on providers yet: list the season again shortly.",
		}),
		filler: z.boolean().openapi({
			description:
				"Whether the episode is filler: story the manga does not have. False when no provider says it is.",
		}),
		extra: z.boolean().openapi({
			description: "An extra only TMDB lists, such as a recap special. It cannot be played.",
		}),
	})
	.openapi("SeasonEpisode") satisfies z.ZodType<SnakeCased<SeasonEpisode>>;

export const ScheduledEpisodeSchema = z
	.object({
		series: SeriesCardSchema,
		season_id: z.string(),
		episode: z.number().int(),
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
		season_id: z.string(),
		season_title: z.string().openapi({
			example: "Season 2",
		}),
		episode: z.number().int().openapi({
			description: "Position within the season, from 1.",
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
		season_id: z.string(),
		episode: z.number().int(),
		expires_at: z.string().openapi({
			description:
				"When the stream URLs stop working, as an ISO 8601 timestamp. Resolve again after it.",
			example: "2026-09-25T18:00:00.000Z",
		}),
		next: z.string().nullable().openapi({
			description:
				"The next episode's playback URL, into the next season in watch order (or the next extra, from an extra) after a season's last episode, or null after the last one.",
			example: "/v1/series/GYZJ43JMR/seasons/G6NQ5DWZ6/episodes/2/playback",
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
		season_id: z.string(),
		episode: z.number().int().openapi({
			description: "Position within the season, from 1.",
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
				"Whether the profile stopped where the episode is over, as the player it watched in judged: it played to the end, or only its credits were left. Play a finished episode from the start.",
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
	season_id: z.string(),
	season_title: z.string().openapi({
		example: "Season 2",
	}),
	season_kind: z.enum(["season", "ova", "movie"]),
	season_number: z.number().int().openapi({
		description: "The season's position among the show's seasons of the same kind, from 1.",
	}),
	episode: z.number().int().openapi({
		description: "Position within the season, from 1.",
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

export const SeriesProgressSchema = z
	.object({
		episodes: z.array(ProgressSchema).openapi({
			description:
				"The progress in every episode of the show the profile played, the most recently played first.",
		}),
		watched: z
			.array(
				z.object({
					season_id: z.string(),
					episode: z.number().int().openapi({
						description: "Position within the season, from 1.",
					}),
				}),
			)
			.openapi({
				description:
					"The episodes of the show the profile watched, in no particular order: the ones it finished at some point, and the ones it marked. One stays here while its progress is unfinished again from playing it a second time.",
			}),
		watched_seasons: z.array(z.string()).openapi({
			description: "The IDs of the seasons whose every episode that can be played is in `watched`.",
		}),
		completed_seasons: z.array(z.string()).openapi({
			description:
				"The IDs of the seasons the profile completed: the ones in `watched_seasons` that have finished coming out. A season still airing is never complete.",
		}),
		completed: z.boolean().openapi({
			description:
				"Whether the profile completed the show: every regular season of its story that has an episode out is in `completed_seasons`. Films, OVAs, and specials do not count, unless the show has no regular season; nor does a season announced with nothing out yet. A new season starting to air makes a completed show incomplete again.",
		}),
		next: NextEpisodeSchema.nullable().openapi({
			description:
				"The episode to play next, as `listContinueWatching` picks it; null when the profile played none of the show, or nothing comes after the last one it finished.",
		}),
		offered: NextEpisodeSchema.nullable().openapi({
			description:
				"The first episode of the part that comes after, when `next` is null because the show does not go on into that part by itself: a season still airing, one that came out after the profile finished the one before it, a film, an OVA, or a special. The profile starts it to go on.",
		}),
	})
	.openapi("SeriesProgress") satisfies z.ZodType<SnakeCased<SeriesProgress>>;

export const ShowSchema = z
	.object({
		series: SeriesCardSchema,
		added_at: z.string().openapi({
			description: "When the series entered the profile's Shows, as an ISO 8601 timestamp.",
			example: "2026-10-01T18:00:00.000Z",
		}),
		status: z.enum(["planned", "watching", "completed", "dropped"]).openapi({
			description:
				"Where the profile is with the series. `planned`: saved, with nothing played or watched yet. `watching`: a season it started is not complete, which being caught up with one still airing is too, or the season after was already out when it finished. `completed`: it finished every season it started, with no season after them that was out by then; one that came out since is `offered`, and changes nothing until the profile starts it. `dropped`: given up on; see `dropShow`. Show the status as it is, rather than working it out again from `next`, `offered`, or the counts.",
		}),
		next: NextEpisodeSchema.nullable().openapi({
			description: "The episode to play next, as `SeriesProgress.next` tells it.",
		}),
		offered: NextEpisodeSchema.nullable().openapi({
			description:
				"The episode the series stops before, as `SeriesProgress.offered` tells it. On a `completed` series, it is the part that came out since, or that the profile never started.",
		}),
		episode_count: z.number().int().nonnegative().openapi({
			description: "How many episodes of the series can be played, in all of its seasons.",
		}),
		watched_count: z.number().int().nonnegative().openapi({
			description: "How many of those episodes the profile watched.",
		}),
		active_at: z.string().openapi({
			description:
				"When the profile last had to do with the series: played an episode of it, or, before that, added it. An ISO 8601 timestamp.",
			example: "2026-10-01T18:00:00.000Z",
		}),
	})
	.openapi("Show") satisfies z.ZodType<SnakeCased<Show>>;

export const HistoryItemSchema = z
	.object({
		series: SeriesCardSchema,
		season_id: z.string(),
		season_title: z.string().openapi({
			example: "Season 2",
		}),
		season_kind: z.enum(["season", "ova", "movie"]),
		episode: z.number().int().openapi({
			description: "Position within the season, from 1.",
		}),
		episode_title: z.string().nullable(),
		episode_still_url: z.string().nullable(),
		watched: z.boolean().openapi({
			description:
				"Whether the profile watched the episode: finished it at some point, or marked it. One it only played part of is not watched.",
		}),
		position_seconds: z.number().int().nullable().openapi({
			description:
				"Where the profile stopped when it last played the episode, in seconds from the start; null for one it marked watched and never played.",
		}),
		duration_seconds: z.number().int().nullable().openapi({
			description:
				"How long the episode ran when the profile last played it, in seconds; null for one it marked watched and never played.",
		}),
		listed_at: z.string().openapi({
			description:
				"When the episode took its place in the history, as an ISO 8601 timestamp: when the profile first finished or marked it, or, for one not watched yet, when it last played it.",
			example: "2026-10-01T18:00:00.000Z",
		}),
	})
	.openapi("HistoryItem") satisfies z.ZodType<SnakeCased<HistoryItem>>;

export const HistoryMetaSchema = z
	.object({
		count: z.number().int().nonnegative(),
		next: z.string().nullable().openapi({
			description: "The next page's URL, or null on the last page.",
			example: "/v1/profiles/7HTQ2LMXB/history?after=2026-10-01T18:00:00.000Z_EWBMBNIV4_12",
		}),
	})
	.openapi("HistoryMeta");

export const DroppedSchema = z
	.object({
		series_ids: z.array(z.string()).openapi({
			description: "The series the profile dropped.",
		}),
		related_series_ids: z.array(z.string()).openapi({
			description:
				"The stored series related to a dropped one, such as its spin-offs and the sequels listed as shows of their own. They are not dropped, but leave them out of what is suggested to the profile all the same.",
		}),
	})
	.openapi("Dropped") satisfies z.ZodType<SnakeCased<Dropped>>;
