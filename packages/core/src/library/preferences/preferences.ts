import { defined } from "@sora/shared";
import { eq, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { playbackPreference } from "../../database/schema/library";
import { InvalidInputError } from "../../errors";
import { PlaybackPreferencesUpdateSchema, SubtitlePreferencesSchema } from "../../models/library";
import type { PlaybackPreferences, PlaybackPreferencesUpdate } from "../../models/library";
import { LanguageSchema } from "../../models/series";

const defaults: PlaybackPreferences = {
	audio: null,
	auto_skip: false,
	autoplay_next: true,
	subtitles: {},
};

const toPreferences = (row: typeof playbackPreference.$inferSelect): PlaybackPreferences => {
	const audio = LanguageSchema.safeParse(row.audio);
	const subtitles = SubtitlePreferencesSchema.safeParse(row.subtitles);

	return {
		audio: audio.success ? audio.data : null,
		auto_skip: row.autoSkip,
		autoplay_next: row.autoplayNext,
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

	const { audio, subtitles, auto_skip: autoSkip, autoplay_next: autoplayNext } = parsed.data;
	const [row] = await db
		.insert(playbackPreference)
		.values({
			audio: audio ?? null,
			autoSkip: autoSkip ?? false,
			autoplayNext: autoplayNext ?? true,
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
				...(autoSkip !== undefined && {
					autoSkip,
				}),
				...(autoplayNext !== undefined && {
					autoplayNext,
				}),
				updatedAt: sql`now()`,
			},
			target: playbackPreference.userId,
		})
		.returning();

	return toPreferences(defined(row));
};
