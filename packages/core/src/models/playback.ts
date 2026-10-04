import { z } from "zod";

import { LanguageSchema } from "./series";

export const LocaleSchema = z.string().min(1).meta({
	description: "BCP 47 language tag.",
	example: "en",
});

export const SkipSegmentSchema = z
	.object({
		kind: z.enum(["opening", "ending"]),
		start: z.number().nonnegative().meta({
			description: "Seconds from the start of the stream.",
		}),
		end: z.number().positive().meta({
			description: "Seconds from the start of the stream; always after `start`.",
		}),
	})
	.meta({
		id: "SkipSegment",
	});

/** One way to play an episode. */
export const PlaybackSourceSchema = z.object({
	url: z.url().meta({
		description:
			"The stream through Sora's proxy; hand it to the player as is. Expires with the playback.",
	}),
	format: z.enum(["hls", "mp4"]),
	quality: z.enum(["auto", "1080p", "720p", "480p", "360p"]),
});

export const PlaybackSubtitleSchema = z.object({
	url: z.url().meta({
		description:
			"The subtitle file through Sora's proxy; hand it to the player as is. Expires with the playback.",
	}),
	language: z.string().meta({
		description: "BCP 47 language tag.",
		example: "en",
	}),
	label: z.string().meta({
		description: "The language's English name, for a subtitle menu.",
		example: "Brazilian Portuguese",
	}),
	format: z.enum(["vtt", "srt", "ass"]).nullable(),
	kind: z.enum(["dialogue", "signs", "captions"]).nullable().meta({
		description:
			"What the track carries, worked out from its name and its cues: `dialogue` is what the characters say, `signs` is text shown on screen and forced subtitles, and `captions` is dialogue with descriptions of sound. Null when that is not clear, in which case a menu should show the track as plain subtitles.",
	}),
	default: z.boolean().meta({
		description:
			"Whether a player shows this track from the start: the English dialogue track, for a sub and a dub alike. None for raw or a hardsub, which has no English track.",
	}),
});

export const PlaybackMediaSchema = z
	.object({
		audio: LanguageSchema,
		label: z.string().meta({
			description: "The audio's name, for an audio menu.",
			example: "Dub",
		}),
		locale: LocaleSchema.nullable().meta({
			description:
				"Language of the dub's audio or of the sub's default subtitles: always `en`, since Sora serves English. Null for raw, which keeps the original audio and has no subtitles.",
		}),
		provider: z.string().meta({
			description: "The provider that serves this version.",
		}),
		hardsub: z.boolean().meta({
			description:
				"Whether the English subtitles are burned into the picture rather than served as a track, so they cannot be styled or turned off; `subtitles` then holds other languages only, if any. A sub with an English track is served when any provider has one. Always false for dub and raw.",
		}),
		sources: z.array(PlaybackSourceSchema).meta({
			description: "Ordered best first.",
		}),
		subtitles: z.array(PlaybackSubtitleSchema),
		skip_segments: z.array(SkipSegmentSchema).meta({
			description:
				"Opening and ending, in playback order, as the provider's player ships them. Timed against these sources: a dub can be cut differently from its sub. Empty when the provider reports none.",
		}),
	})
	.meta({
		id: "PlaybackMedia",
	});

export type SkipSegment = z.infer<typeof SkipSegmentSchema>;
export type PlaybackSource = z.infer<typeof PlaybackSourceSchema>;
export type PlaybackSubtitle = z.infer<typeof PlaybackSubtitleSchema>;
export type PlaybackMedia = z.infer<typeof PlaybackMediaSchema>;
