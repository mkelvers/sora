import { defined } from "@sora/shared";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

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

/** Medium text with an outline and no box. */
const subtitleStyle: SubtitleStyle = {
	background_opacity: 0,
	edge: "outline",
	size: "medium",
};

/** A stored subtitle style: each part it lacks, or no longer offers, has its default. */
const StoredSubtitleStyleSchema = z
	.object({
		background_opacity: SubtitleStyleSchema.shape.background_opacity.catch(
			subtitleStyle.background_opacity,
		),
		edge: SubtitleStyleSchema.shape.edge.catch(subtitleStyle.edge),
		size: SubtitleStyleSchema.shape.size.catch(subtitleStyle.size),
	})
	.catch(subtitleStyle);

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

	return {
		audio: audio.success ? audio.data : null,
		auto_skip: row.autoSkip,
		autoplay_next: row.autoplayNext,
		quality: row.quality,
		subtitle_style: StoredSubtitleStyleSchema.parse(row.subtitleStyle),
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

	return toPreferences(defined(row));
};
