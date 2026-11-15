import { defined } from "@sora/shared";
import { eq, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { playbackPreference } from "../../database/schema/library";
import { InvalidInputError } from "../../errors";
import {
	PlaybackPreferencesUpdateSchema,
	SubtitlePreferencesSchema,
	SubtitleStyleSchema,
} from "../../models/library";
import type {
	PlaybackPreferences,
	PlaybackPreferencesUpdate,
	SubtitleStyle,
} from "../../models/library";
import { LanguageSchema } from "../../models/series";

/** White text with a black outline and no box, at the bottom. */
const subtitleStyle: SubtitleStyle = {
	background_color: "black",
	background_opacity: 0,
	edge: "outline",
	position: "bottom",
	size: 100,
	text_color: "white",
	text_opacity: 100,
};

const defaults: PlaybackPreferences = {
	audio: null,
	auto_skip: false,
	autoplay_next: true,
	quality: null,
	subtitle_style: subtitleStyle,
	subtitles: {},
};

const toPreferences = (row: typeof playbackPreference.$inferSelect): PlaybackPreferences => {
	const audio = LanguageSchema.safeParse(row.audio);
	const subtitles = SubtitlePreferencesSchema.safeParse(row.subtitles);
	const style = SubtitleStyleSchema.partial().safeParse(row.subtitleStyle);

	return {
		audio: audio.success ? audio.data : null,
		auto_skip: row.autoSkip,
		autoplay_next: row.autoplayNext,
		quality: row.quality,
		subtitle_style: {
			...subtitleStyle,
			...(style.success && style.data),
		},
		subtitles: subtitles.success ? subtitles.data : {},
	};
};

/** A user's playback preferences; the defaults until they pick anything. */
export const getPlaybackPreferences = async (userId: string): Promise<PlaybackPreferences> => {
	const [row] = await db
		.select()
		.from(playbackPreference)
		.where(eq(playbackPreference.userId, userId))
		.limit(1);

	return row ? toPreferences(row) : defaults;
};

/**
 * Changes a user's playback preferences and returns them as they now stand.
 *
 * @throws {InvalidInputError} when the update fails
 *   {@link PlaybackPreferencesUpdateSchema}.
 */
export const updatePlaybackPreferences = async (
	userId: string,
	update: PlaybackPreferencesUpdate,
): Promise<PlaybackPreferences> => {
	const parsed = PlaybackPreferencesUpdateSchema.safeParse(update);
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

	return toPreferences(defined(row));
};
