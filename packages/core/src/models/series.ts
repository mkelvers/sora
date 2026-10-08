import { z } from "zod";

import { logoPlacement } from "../series/logo-placement";

export const StatusSchema = z.enum([
	"FINISHED",
	"RELEASING",
	"NOT_YET_RELEASED",
	"CANCELLED",
	"HIATUS",
]);

/** Dubbed audio, the original audio with subtitles (sub), or the original audio alone (raw). */
export const LanguageSchema = z.enum(["dub", "sub", "raw"]);

export const FormatSchema = z.enum(["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"]);

export const SeriesCardSchema = z
	.object({
		id: z.string().meta({
			example: "GYZJ43JMR",
		}),
		kind: z.enum(["tv", "movie", "standalone"]).meta({
			description:
				"How TMDB lists the entry: in a show (`tv`), as a film (`movie`), or not at all (`standalone`).",
		}),
		format: FormatSchema.nullable().meta({
			description: "What AniList lists the entry as, such as a TV season, a film, or an OVA.",
		}),
		title: z.string().meta({
			description: "AniList's title of the entry, which names its season.",
			example: "That Time I Got Reincarnated as a Slime Season 2",
		}),
		poster_url: z.string().nullable().meta({
			description: "AniList's cover of the entry.",
		}),
		backdrop_url: z.string().nullable().meta({
			description:
				"TMDB's backdrop of the show or film, which the seasons of a show share, or AniList's banner when TMDB has none.",
		}),
		logo_url: z.string().nullable(),
		logo_scale: z.number().meta({
			description: "How large to draw the logo, relative to its usual size: 1 is as usual.",
			example: 1,
		}),
		logo_offset_x: z.number().meta({
			description:
				"How far right to move the logo from its usual place on the series page, in widths of its hero.",
			example: 0,
		}),
		logo_offset_y: z.number().meta({
			description:
				"How far down to move the logo from its usual place on the series page, in widths of its hero.",
			example: 0,
		}),
		year: z.number().int().nullable().meta({
			example: 2021,
		}),
		status: StatusSchema.nullable(),
		audio: z.array(LanguageSchema).meta({
			description:
				"The audio any of its episodes can be watched with, dub before sub before raw. Empty when nothing streams it, or while Sora has not looked it up on providers yet.",
		}),
		overview: z.string().nullable(),
		score: z.number().nullable().meta({
			description: "AniList's weighted score, 0–100.",
		}),
		genres: z.array(z.string()).meta({
			description: "AniList's genres.",
		}),
		episode_count: z.number().int().meta({
			description: "How many episodes it lists, as `listEpisodes` lists them.",
		}),
		details: z.string().meta({
			description:
				"Its year, format, and whether it is airing or upcoming, in words, as a line under its title.",
			example: "2021 · Series · Airing",
		}),
	})
	.meta({
		id: "SeriesCard",
	});

export const AnimeTagSchema = z.object({
	name: z.string(),
	rank: z.number().nullable(),
	spoiler: z.boolean(),
});

/** One title of a franchise as a series page lists it. */
export const FranchisePartSchema = z.object({
	series_id: z.string(),
	role: z.enum(["season", "related"]).meta({
		description:
			"Seasons of the franchise's first show, distinguished from films, specials, and other related titles. This is a navigation grouping, not a canon verdict.",
	}),
	card: SeriesCardSchema.meta({
		description:
			"The full title and metadata used by catalog posters, including artwork, audio, rating, and synopsis.",
	}),
	title: z.string().meta({
		description:
			"The title without the franchise's name, such as `Season 2`, `OAD`, or `Tears of the Azure Sea`; the first season is `Season 1`. A title not named after the franchise keeps its whole title.",
		example: "Season 2",
	}),
	format: FormatSchema.nullable(),
	episode_count: z.number().int().meta({
		description: "How many of its episodes can be watched.",
	}),
});

export const SeriesSchema = SeriesCardSchema.extend({
	start_date: z.string().nullable().meta({
		description:
			"First release: `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, as precise as AniList knows it.",
		example: "2018-10-02",
	}),
	tags: z.array(AnimeTagSchema),
	studios: z.array(z.string()),
	score_count: z.number().int().nullable().meta({
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
		.meta({
			description: "The next episode to air, or null when none is announced.",
		}),
	backdrop_edges: z
		.object({
			left: z.string().meta({
				example: "#1b2330",
			}),
			right: z.string().meta({
				example: "#0d1118",
			}),
		})
		.nullable()
		.meta({
			description:
				"The backdrop's average colour down its left and right edges, as `#rrggbb`, to fill the space beside it when it is shown whole. Null without a backdrop, or until Sora has measured it.",
		}),
	seasons: z.array(FranchisePartSchema).meta({
		description:
			"The seasons of its franchise in release order, to switch between on its page, with this title first when it is not one of them, such as a film. Just this one when it has no other.",
	}),
	related: z.array(FranchisePartSchema).meta({
		description:
			"The other titles of its franchise that are out and are not its seasons, such as its films, OVAs, and spin-offs, in release order.",
	}),
}).meta({
	id: "Series",
});

export const ImageTypeSchema = z.enum(["poster", "backdrop", "logo"]);

export const SeriesImageSchema = z
	.object({
		type: ImageTypeSchema,
		url: z.string().meta({
			description:
				"The original size. Swap `/original/` for a TMDB size bucket, such as `/w780/`, for a smaller file.",
			example: "https://image.tmdb.org/t/p/original/rBOnrVlck7BIlGeWVlzYiZeg4l2.jpg",
		}),
		width: z.number().int().meta({
			example: 3840,
		}),
		height: z.number().int().meta({
			example: 2160,
		}),
		language: z.string().nullable().meta({
			description: "ISO 639-1 code of any text on the image; null when it has none.",
			example: "en",
		}),
		language_name: z.string().meta({
			description: "The language of any text on the image in English, or `Textless`.",
			example: "English",
		}),
		vote_average: z.number(),
		vote_count: z.number().int(),
		season_number: z.number().int().nullable().meta({
			description: "TMDB's number of the season a poster is for; null for the title's own.",
		}),
	})
	.meta({
		id: "SeriesImage",
	});

export const UpcomingSeriesSchema = z
	.object({
		series: SeriesCardSchema,
		start_date: z.string().meta({
			description: "When it starts, as `YYYY-MM-DD`.",
			example: "2026-10-03",
		}),
		returning: z.boolean().meta({
			description:
				"Whether what starts belongs to a franchise with something out already, such as a new season of a show, rather than being a new title. `series` is then the earliest title of the franchise that is out, the one to start catching up on.",
		}),
	})
	.meta({
		id: "UpcomingSeries",
	});

export const EpisodeSchema = z
	.object({
		number: z.number().int(),
		title: z.string().nullable(),
		overview: z.string().nullable(),
		air_date: z.string().nullable().meta({
			description: "YYYY-MM-DD, in the calendar of the country the episode aired in.",
			example: "2018-10-02",
		}),
		aired_at: z.string().nullable().meta({
			description:
				"ISO 8601 timestamp of the broadcast, to show in the viewer's time zone. Null when it is not known, as for most older anime; air_date is then the only date known.",
			example: "2018-10-02T15:00:00.000Z",
		}),
		runtime_minutes: z.number().int().nullable(),
		still_url: z.string().nullable(),
		audio: z.array(LanguageSchema).nullable().meta({
			description:
				"The audio the episode can be watched with, dub before sub before raw: dubbed, the original with subtitles, or the original alone. Empty when nothing streams it, and null only when Sora could not look it up on providers yet: list the episodes again shortly.",
		}),
		filler: z.boolean().meta({
			description:
				"Whether the episode is filler: story the manga does not have. False when no provider says it is.",
		}),
	})
	.meta({
		id: "Episode",
	});

export const ScheduledEpisodeSchema = z
	.object({
		series: SeriesCardSchema,
		episode: z.number().int().meta({
			description: "The episode's number in the series, from 1.",
		}),
		air_type: z.enum(["sub", "dub"]).meta({
			description:
				"Whether it comes out with English subtitles (`sub`) or dubbed in English (`dub`).",
		}),
		airing_at: z.string(),
	})
	.meta({
		id: "ScheduledEpisode",
	});

export const CalendarReleaseSchema = z.object({
	series: SeriesCardSchema,
	audio: z.array(z.enum(["sub", "dub"])).meta({
		description: "Whether these episodes come out subbed, dubbed, or both at this time.",
	}),
	episodes: z.string().meta({
		description: "The episodes coming out, as runs of numbers.",
		example: "Episodes 3–5, 7",
	}),
});

export const CalendarSlotSchema = z.object({
	airing_at: z.string(),
	time: z.string().meta({
		description: "When it airs on the 24-hour clock of the calendar's time zone.",
		example: "17:30",
	}),
	aired: z.boolean(),
	next: z.boolean().meta({
		description: "Whether it is the first time today that has yet to air.",
	}),
	releases: z.array(CalendarReleaseSchema).meta({
		description: "What comes out at this time, one entry per title and audio that share episodes.",
	}),
});

export const CalendarDaySchema = z.object({
	date: z.string().meta({
		example: "2026-10-05",
	}),
	today: z.boolean(),
	name: z.string().meta({
		example: "Monday",
	}),
	short_name: z.string().meta({
		description: "`Today` for today, else the weekday's abbreviation.",
		example: "Mon",
	}),
	label: z.string().meta({
		example: "Monday, October 5",
	}),
	month_day: z.string().meta({
		example: "October 5",
	}),
	number: z.number().int().meta({
		description: "The day of the month.",
		example: 5,
	}),
	count: z.number().int().meta({
		description: "How many episodes come out on the day, subbed and dubbed counted apart.",
	}),
	slots: z.array(CalendarSlotSchema),
});

export const CalendarSchema = z
	.object({
		week: z.string().meta({
			description: "The week's dates, Monday to Sunday.",
			example: "Oct 5 – 11, 2026",
		}),
		now: z.string().meta({
			description: "The time now on the 24-hour clock of the calendar's time zone.",
			example: "14:05",
		}),
		days: z.array(CalendarDaySchema),
	})
	.meta({
		id: "Calendar",
	});

export const AnimeSeasonSchema = z
	.object({
		season: z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]),
		year: z.number().int().meta({
			example: 2026,
		}),
	})
	.meta({
		id: "AnimeSeason",
	});

export const ReleaseSchema = z
	.object({
		series: SeriesCardSchema,
		episode: z.number().int().meta({
			description: "The episode's number in the series, from 1.",
		}),
		released_at: z.string().meta({
			description:
				"When the episode came out: when it aired, or its air date's midnight UTC when AniList has no airing time.",
			example: "2026-09-27T15:00:00.000Z",
		}),
		released_ago: z.string().meta({
			description: "How long ago it came out, as of the request.",
			example: "3 hours ago",
		}),
		period: z.enum(["Last 24 hours", "This past week", "Earlier"]).meta({
			description: "Which stretch of time it came out in, to group releases by.",
		}),
	})
	.meta({
		id: "Release",
	});

/** A title a page found that is still being prepared; see `PageMeta.preparing_titles`. */
export const PreparingTitleSchema = z
	.object({
		anilist_id: z.number().int().meta({
			example: 143653,
		}),
		title: z.string().meta({
			example: "Insomniacs After School",
		}),
		format: z.enum(["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"]).nullable(),
		year: z.number().int().nullable().meta({
			example: 2023,
		}),
		position: z.number().int().nonnegative().meta({
			description:
				"Where among the page's cards, from 0, the title is expected once it is prepared.",
		}),
	})
	.meta({
		id: "PreparingTitle",
	});

export type ContentLanguage = z.infer<typeof LanguageSchema>;
export type AnimeTag = z.infer<typeof AnimeTagSchema>;
/**
 * The hosts artwork may be chosen from, which are those the catalogue's own
 * images come from: any other would let whoever picks artwork, which everyone
 * sees, make every viewer's browser contact a server of their choosing.
 */
export const artworkHosts = ["image.tmdb.org", "s4.anilist.co"];

/** An image to use for a title's artwork, or `null` to go back to the one Sora chose. */
const ArtworkUrlSchema = z
	.union([
		z
			.url({
				protocol: /^https$/,
			})
			.max(2_048)
			.refine((value) => artworkHosts.includes(new URL(value).hostname), {
				message: `The image must be on ${artworkHosts.join(" or ")}`,
			}),
		z.literal(false),
	])
	.nullable()
	.optional();

const LogoOffsetSchema = z
	.number()
	.min(logoPlacement.offset.min)
	.max(logoPlacement.offset.max)
	.optional();

/**
 * Artwork to choose for a series. An HTTPS URL replaces the image, `false`
 * shows none, `null` goes back to the one Sora chose, and an omitted field
 * is left as it is. A TMDB image may be given at its original size, as
 * `listImages` lists it: it is saved at the largest size it is shown at.
 */
export const ArtworkChangesSchema = z
	.object({
		poster_url: ArtworkUrlSchema,
		backdrop_url: ArtworkUrlSchema,
		logo_url: ArtworkUrlSchema,
		logo_scale: z
			.number()
			.min(logoPlacement.scale.min)
			.max(logoPlacement.scale.max)
			.optional()
			.meta({
				description: `How large to draw the logo, relative to its usual size: 1 is as usual, from ${logoPlacement.scale.min} to ${logoPlacement.scale.max}.`,
			}),
		logo_offset_x: LogoOffsetSchema.meta({
			description: `How far right to move the logo from its usual place on the series page, in widths of its hero, from ${logoPlacement.offset.min} to ${logoPlacement.offset.max}.`,
		}),
		logo_offset_y: LogoOffsetSchema.meta({
			description: `How far down to move the logo from its usual place on the series page, in widths of its hero, from ${logoPlacement.offset.min} to ${logoPlacement.offset.max}.`,
		}),
	})
	.strict()
	.meta({
		id: "ArtworkChanges",
		example: {
			backdrop_url: "https://image.tmdb.org/t/p/original/rBOnrVlck7BIlGeWVlzYiZeg4l2.jpg",
		},
	});

export type ArtworkChanges = z.input<typeof ArtworkChangesSchema>;
export type SeriesCard = z.infer<typeof SeriesCardSchema>;
export type FranchisePart = z.infer<typeof FranchisePartSchema>;
export type Series = z.infer<typeof SeriesSchema>;
export type ImageType = z.infer<typeof ImageTypeSchema>;
export type SeriesImage = z.infer<typeof SeriesImageSchema>;
export type UpcomingSeries = z.infer<typeof UpcomingSeriesSchema>;
export type Episode = z.infer<typeof EpisodeSchema>;
export type ScheduledEpisode = z.infer<typeof ScheduledEpisodeSchema>;
export type Calendar = z.infer<typeof CalendarSchema>;
export type AnimeSeason = z.infer<typeof AnimeSeasonSchema>;
export type Release = z.infer<typeof ReleaseSchema>;
export type PreparingTitle = z.infer<typeof PreparingTitleSchema>;
