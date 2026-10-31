import { z } from "zod";

import { LanguageSchema, SeriesCardSchema } from "./series";

export const SubtitleChoiceSchema = z
	.object({
		kind: z.enum(["dialogue", "signs", "captions"]).nullable().meta({
			description: "What the track carries; `null` when that is not clear.",
		}),
		language: z.string().min(1).max(35).meta({
			description: "BCP 47 language tag of the track.",
			example: "en",
		}),
	})
	.meta({
		description:
			"A subtitle track to pick again: the first with this language and kind, else the first with this language.",
		id: "SubtitleChoice",
	});

export const SubtitlePreferencesSchema = z
	.object({
		dub: SubtitleChoiceSchema.nullable().optional(),
		sub: SubtitleChoiceSchema.nullable().optional(),
	})
	.meta({
		description:
			"The subtitles picked for a sub and for a dub: a track to pick again, or `null` for none. An audio left out shows its default track.",
		id: "SubtitlePreferences",
	});

export const PlaybackPreferencesSchema = z
	.object({
		audio: LanguageSchema.nullable().meta({
			description: "The version to play when an episode has it; `null` for the first it has.",
		}),
		auto_skip: z.boolean().meta({
			description: "Whether openings and endings are skipped without asking.",
		}),
		autoplay_next: z.boolean().meta({
			description: "Whether the next episode starts by itself when one ends.",
		}),
		subtitles: SubtitlePreferencesSchema,
	})
	.meta({
		id: "PlaybackPreferences",
	});

export const ProgressSchema = z
	.object({
		duration_seconds: z.number().int().meta({
			description: "How long the episode runs, in seconds.",
			example: 1420,
		}),
		episode: z.number().int().meta({
			description: "The episode's number in the series, from 1.",
		}),
		finished: z.boolean().meta({
			description:
				"Whether the profile stopped where the episode is over, as the player it watched in judged: it played to the end, or stopped in or after its ending. Playing part of a finished episode again leaves it finished. Play a finished episode from the start.",
		}),
		position_seconds: z.number().int().meta({
			description: "Where the profile stopped, in seconds from the start.",
			example: 754,
		}),
		series_id: z.string(),
		watched_at: z.string().meta({
			description: "When the profile last played the episode, as an ISO 8601 timestamp.",
			example: "2026-10-01T18:00:00.000Z",
		}),
	})
	.meta({
		id: "Progress",
	});

const nextEpisode = {
	duration_seconds: z.number().int().nullable().meta({
		description: "How long the episode runs, in seconds; null for one not started.",
	}),
	episode: z.number().int().meta({
		description: "The episode's number in the series, from 1.",
	}),
	position_seconds: z.number().int().meta({
		description: "Where to resume the episode, in seconds; 0 for one not started.",
	}),
};

export const NextEpisodeSchema = z.object(nextEpisode).meta({
	id: "NextEpisode",
});

export const ContinueWatchingSchema = z
	.object({
		series: SeriesCardSchema,
		...nextEpisode,
	})
	.meta({
		id: "ContinueWatching",
	});

export const WatchlistStatusSchema = z
	.enum(["watching", "plan_to_watch", "completed", "dropped"])
	.meta({
		description:
			"Where the profile is with a title on its watchlist. The profile picks it, and playing an episode moves it on: finishing an episode of a listed title makes it `watching`, and finishing the finale of a title that has finished airing makes it `completed`, adding it when it was not listed. A `completed` title stays completed.",
		id: "WatchlistStatus",
	});

export const WatchlistEntrySchema = z
	.object({
		added_at: z.string().meta({
			description: "When the title was put on the watchlist, as an ISO 8601 timestamp.",
			example: "2026-10-01T18:00:00.000Z",
		}),
		series: SeriesCardSchema,
		status: WatchlistStatusSchema,
		updated_at: z.string().meta({
			description: "When its status last changed, as an ISO 8601 timestamp.",
			example: "2026-10-01T18:00:00.000Z",
		}),
	})
	.meta({
		id: "WatchlistEntry",
	});

export const WatchlistStatusEntrySchema = z
	.object({
		series_id: z.string().meta({
			description: "The title's ID.",
		}),
		status: WatchlistStatusSchema,
	})
	.meta({
		id: "WatchlistStatusEntry",
	});

export const SeriesProgressSchema = z
	.object({
		episodes: z.array(ProgressSchema).meta({
			description:
				"The progress in every episode of the title the profile played, the most recently played first: in the rewatch it is in the middle of, if any, else in its first viewing.",
		}),
		finished: z.boolean().meta({
			description:
				"Whether the profile finished every episode the title lists in its first viewing, and is not rewatching it.",
		}),
		next: NextEpisodeSchema.nullable().meta({
			description:
				"The episode to play next, as `listContinueWatching` picks it; null when the profile played none of the title, or finished the last episode that is out.",
		}),
		rewatch_started_at: z.string().nullable().meta({
			description:
				"When the profile started watching the title again from the start (see `startRewatch`), as an ISO 8601 timestamp; null when it is not.",
			example: "2026-10-03T18:00:00.000Z",
		}),
	})
	.meta({
		id: "SeriesProgress",
	});

export const NotificationSchema = z
	.object({
		episode_title: z.string().nullable().meta({
			description: "The title of `last_episode`.",
		}),
		first_episode: z.number().int().meta({
			description: "The first episode that came out, or was dubbed, from 1.",
		}),
		id: z.string().meta({
			description: "Stable for as long as the notification is listed.",
			example: "EWBMBNIV4:13",
		}),
		kind: z.enum(["premiere", "episodes", "dub"]).meta({
			description:
				"`premiere` when the title's first episode came out; `episodes` when a title that was out already gained episodes; `dub` when episodes that were out already were dubbed in English.",
		}),
		last_episode: z.number().int().meta({
			description: "The last such episode; the same as `first_episode` when there was one.",
		}),
		message: z.string().meta({
			description: "What came out, as a sentence to show under the title.",
			example: "Episode 13 is out. Settle in and catch up.",
		}),
		released_at: z.string().meta({
			description: "When it came out, as an ISO 8601 timestamp.",
			example: "2026-10-04T13:30:00.000Z",
		}),
		series: SeriesCardSchema,
		still_url: z.string().nullable().meta({
			description: "A still of `last_episode`, or of the first episode for a premiere.",
		}),
		unread: z.boolean().meta({
			description: "Whether the profile has not marked it read.",
		}),
	})
	.meta({
		id: "Notification",
	});

export const PlaybackPreferencesUpdateSchema = z
	.object({
		audio: LanguageSchema.nullable().optional(),
		auto_skip: z.boolean().optional(),
		autoplay_next: z.boolean().optional(),
		subtitles: SubtitlePreferencesSchema.optional().meta({
			description: "Changes the subtitles of the audio given, leaving the other's as they are.",
		}),
	})
	.meta({
		example: {
			subtitles: {
				dub: null,
			},
		},
		id: "PlaybackPreferencesUpdate",
	});

export const ProfilePreferencesSchema = z
	.object({
		hide_spoilers: z.boolean().meta({
			description:
				"Whether episodes the profile has not watched hide their picture, title and summary in episode lists.",
		}),
		notifications: z
			.object({
				dubs: z.boolean().meta({
					description: "Whether a dub coming out is a notification.",
				}),
				episodes: z.boolean().meta({
					description: "Whether new episodes are notifications.",
				}),
				premieres: z.boolean().meta({
					description: "Whether a season or film premiering is a notification.",
				}),
			})
			.meta({
				description:
					"Which releases of titles the profile follows are notifications. All off mutes them.",
			}),
	})
	.meta({
		id: "ProfilePreferences",
	});

export const ProfilePreferencesUpdateSchema = z
	.object({
		hide_spoilers: z.boolean().optional(),
		notifications: ProfilePreferencesSchema.shape.notifications.partial().optional().meta({
			description: "Changes the kinds given, leaving the others as they are.",
		}),
	})
	.meta({
		id: "ProfilePreferencesUpdate",
	});

export const ProgressInputSchema = z
	.object({
		duration_seconds: z.number().int().positive(),
		finished: z.boolean().meta({
			description:
				"Whether the episode is over where the profile stopped: it played to the end, or only its credits are left. The player judges, since it knows where the credits are.",
		}),
		position_seconds: z.number().int().nonnegative(),
	})
	.meta({
		example: {
			duration_seconds: 1420,
			finished: false,
			position_seconds: 754,
		},
		id: "ProgressInput",
	});

export type ProfilePreferences = z.infer<typeof ProfilePreferencesSchema>;
export type ProfilePreferencesUpdate = z.input<typeof ProfilePreferencesUpdateSchema>;
export type PlaybackPreferencesUpdate = z.input<typeof PlaybackPreferencesUpdateSchema>;
export type ProgressInput = z.input<typeof ProgressInputSchema>;
export type SubtitleChoice = z.infer<typeof SubtitleChoiceSchema>;
export type PlaybackPreferences = z.infer<typeof PlaybackPreferencesSchema>;
export type Progress = z.infer<typeof ProgressSchema>;
export type NextEpisode = z.infer<typeof NextEpisodeSchema>;
export type ContinueWatching = z.infer<typeof ContinueWatchingSchema>;
export type WatchlistStatus = z.infer<typeof WatchlistStatusSchema>;
export type WatchlistEntry = z.infer<typeof WatchlistEntrySchema>;
export type WatchlistStatusEntry = z.infer<typeof WatchlistStatusEntrySchema>;
export type SeriesProgress = z.infer<typeof SeriesProgressSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
