import { defined } from "@sora/shared";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import { playbackPreference } from "../../database/schema/library";
import { InvalidInputError } from "../../errors";
import {
	PlaybackChangesSchema,
	SubtitlePreferencesSchema,
	SubtitleStyleSchema,
} from "../../models/library";
import type {
	PlaybackPreferences,
	PlaybackPreferencesUpdate,
	SubtitleStyle,
} from "../../models/library";
import { LanguageSchema } from "../../models/series";

/** Medium white text with a medium black outline and no box. */
const subtitleStyle: SubtitleStyle = {
	background_color: "black",
	background_opacity: 0,
	edge: "outline",
	edge_width: "medium",
	size: "medium",
	text_color: "white",
};

/** A user's stored playback preferences. */
class Stored {
	/** A stored subtitle style: each part it lacks, or no longer offers, has its default. */
	static readonly #style = z
		.object({
			background_color: SubtitleStyleSchema.shape.background_color.catch(
				subtitleStyle.background_color,
			),
			background_opacity: SubtitleStyleSchema.shape.background_opacity.catch(
				subtitleStyle.background_opacity,
			),
			edge: SubtitleStyleSchema.shape.edge.catch(subtitleStyle.edge),
			edge_width: SubtitleStyleSchema.shape.edge_width.catch(subtitleStyle.edge_width),
			size: SubtitleStyleSchema.shape.size.catch(subtitleStyle.size),
			text_color: SubtitleStyleSchema.shape.text_color.catch(subtitleStyle.text_color),
		})
		.catch(subtitleStyle);

	readonly #row: typeof playbackPreference.$inferSelect;

	constructor(row: typeof playbackPreference.$inferSelect) {
		this.#row = row;
	}

	get preferences(): PlaybackPreferences {
		const row = this.#row;
		const audio = LanguageSchema.safeParse(row.audio);
		const subtitles = SubtitlePreferencesSchema.safeParse(row.subtitles);
		const style = Stored.#style.parse(row.subtitleStyle);
		let language: PlaybackPreferences["audio"] = null;
		let chosen: PlaybackPreferences["subtitles"] = {};

		if (audio.success) {
			language = audio.data;
		}

		if (subtitles.success) {
			chosen = subtitles.data;
		}

		return {
			audio: language,
			auto_skip: row.autoSkip,
			autoplay_next: row.autoplayNext,
			quality: row.quality,
			subtitle_style: style,
			subtitle_style_changed: SubtitleStyleSchema.keyof().options.some(
				(part) => style[part] !== subtitleStyle[part],
			),
			subtitles: chosen,
		};
	}
}

/** A user's playback preferences; the defaults until they pick anything. */
export const getPlaybackPreferences = async (userId: string): Promise<PlaybackPreferences> => {
	const defaults: PlaybackPreferences = {
		audio: null,
		auto_skip: false,
		autoplay_next: true,
		quality: null,
		subtitle_style: subtitleStyle,
		subtitle_style_changed: false,
		subtitles: {},
	};

	const [row] = await db
		.select()
		.from(playbackPreference)
		.where(eq(playbackPreference.userId, userId))
		.limit(1);

	if (row) {
		return new Stored(row).preferences;
	}

	return defaults;
};

/**
 * Changes a user's playback preferences and returns them as they now stand.
 *
 * @throws {InvalidInputError} when the update fails
 *   {@link PlaybackChangesSchema}.
 */
export const updatePlaybackPreferences = async (
	userId: string,
	update: PlaybackPreferencesUpdate,
): Promise<PlaybackPreferences> => {
	const parsed = PlaybackChangesSchema.safeParse(update);

	if (!parsed.success) {
		throw new InvalidInputError("Invalid playback preferences", {
			cause: parsed.error,
		});
	}

	const {
		audio,
		subtitles,
		auto_skip: autoSkip,
		autoplay_next: autoplayNext,
		quality,
		subtitle_style: style,
	} = parsed.data;

	const [row] = await db
		.insert(playbackPreference)
		.values({
			audio: audio ?? null,
			autoSkip: autoSkip ?? false,
			autoplayNext: autoplayNext ?? true,
			quality: quality ?? null,
			subtitleStyle: style ?? {},
			subtitles: subtitles ?? {},
			userId,
		})
		.onConflictDoUpdate({
			set: {
				...(audio !== undefined && {
					audio,
				}),
				...(subtitles && {
					subtitles: sql`${playbackPreference.subtitles} || excluded.subtitles`,
				}),
				...(style === null && {
					subtitleStyle: {},
				}),
				...(style && {
					subtitleStyle: sql`${playbackPreference.subtitleStyle} || excluded.subtitle_style`,
				}),
				...(autoSkip !== undefined && {
					autoSkip,
				}),
				...(autoplayNext !== undefined && {
					autoplayNext,
				}),
				...(quality !== undefined && {
					quality,
				}),
				updatedAt: sql`now()`,
			},
			target: playbackPreference.userId,
		})
		.returning();

	return new Stored(defined(row)).preferences;
};
