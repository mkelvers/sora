import { eq, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { playbackPreference } from "../../database/schema";
import { InvalidInputError } from "../../errors";
import {
	PlaybackPreferencesUpdateSchema,
	SubtitlePreferencesSchema,
	type PlaybackPreferences,
	type PlaybackPreferencesUpdate,
} from "../../models/library";
import { LanguageSchema } from "../../models/series";

const defaults: PlaybackPreferences = {
	audio: null,
	subtitles: {},
	auto_skip: false,
};

/** A user's playback preferences; the defaults until they pick anything. */
export async function getPlaybackPreferences(userId: string): Promise<PlaybackPreferences> {
	const [row] = await db
		.select()
		.from(playbackPreference)
		.where(eq(playbackPreference.userId, userId))
		.limit(1);

	return row ? toPreferences(row) : defaults;
}

/**
 * Changes a user's playback preferences and returns them as they now stand.
 *
 * @throws {@link InvalidInputError} when the update fails
 *   {@link PlaybackPreferencesUpdateSchema}.
 */
export async function updatePlaybackPreferences(
	userId: string,
	update: PlaybackPreferencesUpdate,
): Promise<PlaybackPreferences> {
	const parsed = PlaybackPreferencesUpdateSchema.safeParse(update);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid playback preferences", {
			cause: parsed.error,
		});
	}

	const { audio, subtitles, auto_skip: autoSkip } = parsed.data;
	const [row] = await db
		.insert(playbackPreference)
		.values({
			userId,
			audio: audio ?? null,
			subtitles: subtitles ?? {},
			autoSkip: autoSkip ?? false,
		})
		.onConflictDoUpdate({
			target: playbackPreference.userId,
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
				updatedAt: sql`now()`,
			},
		})
		.returning();

	return toPreferences(row!);
}

function toPreferences(row: typeof playbackPreference.$inferSelect): PlaybackPreferences {
	const audio = LanguageSchema.safeParse(row.audio);
	const subtitles = SubtitlePreferencesSchema.safeParse(row.subtitles);

	return {
		audio: audio.success ? audio.data : null,
		subtitles: subtitles.success ? subtitles.data : {},
		auto_skip: row.autoSkip,
	};
}
